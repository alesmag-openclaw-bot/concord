// Live end-to-end check of the migrated runner against a real opencode 2.x
// server. Not part of the test suite; run manually with:
//   npx tsx scripts/live-v2-check.ts
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import {
  OpencodeSdkRunner,
  RealRunMcpBackendFactory,
  type RunUpdate,
} from "../src/index";
import type { RequestRunInput } from "../src/domain/ports/in/request-run-input";
import type { RecordRunUpdate } from "../src/domain/ports/in/record-run-update";


class StubRequestRunInput implements RequestRunInput {
  public async request(): Promise<Record<string, string | string[]>> {
    throw new Error("live check does not answer questions");
  }
}

class StubRecordRunUpdate implements RecordRunUpdate {
  public async record(runId: string, message: string): Promise<RunUpdate> {
    console.log(`[run-update] ${message}`);
    return new RunUpdate("u", runId, "c", message, new Date());
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "concord-v2-live-"));
  writeFileSync(path.join(dir, "notes.txt"), "hello concord\n");
  const wiring = {
    requestRunInput: new StubRequestRunInput(),
    recordRunUpdate: new StubRecordRunUpdate(),
    mcpBackendFactory: new RealRunMcpBackendFactory(),
  };
  const runner = new OpencodeSdkRunner(undefined, undefined, undefined, wiring, {
    log: () => {},
    debug: () => {},
    info: () => {},
    warn: (_scope: string, message: string, fields?: unknown) => console.log(`[warn] ${message}`, fields ?? ""),
    error: (_scope: string, message: string, fields?: unknown) => console.log(`[error] ${message}`, fields ?? ""),
  });

  const options = {
    agentId: "build",
    modelId: "opencode/glm-5.3-flash-free",
    runId: "live-check-1",
    consumerId: "live-check",
    maxInputRounds: 1,
  };

  console.log("== structured run (schema in prompt, JSON parsed from final message)");
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { fileCount: { type: "number" }, firstFile: { type: "string" } },
    required: ["fileCount", "firstFile"],
  };
  const output = await runner.runStructured(
    dir,
    "Use a shell command to list the files in the current directory, then produce the structured output.",
    schema,
    options,
  );
  console.log("structured output:", JSON.stringify(output));

  console.log("== unstructured run exercising the concord-run-tools MCP server");
  // The model must call the post_update MCP tool — the only way to produce the
  // word — which proves opencode 2.x connected to the per-run remote MCP
  // endpoint registered through OPENCODE_CONFIG_CONTENT.
  const text = await runner.run(
    dir,
    "Call the post_update tool with message 'live-mcp-check', then reply with the single word: done.",
    { ...options, runId: "live-check-2" },
  );
  console.log("final text:", JSON.stringify(text));
  process.exit(0);
}

main().catch((cause: unknown) => {
  console.error("LIVE CHECK FAILED:", cause);
  process.exit(1);
});
