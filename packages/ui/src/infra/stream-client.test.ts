import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StreamClient } from "./stream-client";
import type { StreamFrame } from "./types";

interface MockSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  readyState: number;
}

describe("StreamClient", () => {
  let mockSocket: MockSocket;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      close: vi.fn(),
      send: vi.fn(),
      readyState: 0,
    };
    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => mockSocket),
    );
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:5173" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.WebSocket = originalWebSocket;
  });

  it("dispatches a parsed frame to the handler", () => {
    const client = new StreamClient();
    const handler = vi.fn();

    client.connect(handler);

    const frame: StreamFrame = { type: "event.created", data: { id: "evt-1" } };
    mockSocket.onmessage!({ data: JSON.stringify(frame) });

    expect(handler).toHaveBeenCalledWith(frame);
  });

  it("attempts reconnection after a close with exponential backoff", () => {
    const client = new StreamClient();
    client.connect(vi.fn());

    expect(mockSocket.onclose).not.toBeNull();
    mockSocket.onclose!();

    const newMock: MockSocket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      close: vi.fn(),
      send: vi.fn(),
      readyState: 0,
    };
    mockSocket = newMock;
    vi.mocked(globalThis.WebSocket).mockImplementation(() => newMock as unknown as WebSocket);

    vi.advanceTimersByTime(1000);

    expect(vi.mocked(globalThis.WebSocket)).toHaveBeenCalledTimes(2);
  });

  it("queues a message sent while connecting and flushes it on open", () => {
    const client = new StreamClient();
    client.connect(vi.fn());
    expect(mockSocket.onopen).not.toBeNull();

    const delivered = client.send('{"type":"subscribe","runId":"run-1"}');
    expect(delivered).toBe(false);
    expect(mockSocket.send).not.toHaveBeenCalled();

    mockSocket.readyState = 1;
    mockSocket.onopen!(undefined);

    expect(mockSocket.send).toHaveBeenCalledWith('{"type":"subscribe","runId":"run-1"}');
  });

  it("notifies open listeners when the socket opens", () => {
    const client = new StreamClient();
    const listener = vi.fn();
    client.onOpen(listener);
    client.connect(vi.fn());

    mockSocket.readyState = 1;
    mockSocket.onopen!(undefined);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("drops queued messages when disconnected", () => {
    const client = new StreamClient();
    client.connect(vi.fn());

    client.send('{"type":"subscribe","runId":"run-1"}');
    client.disconnect();

    mockSocket.readyState = 1;
    mockSocket.onopen!(undefined);

    expect(mockSocket.send).not.toHaveBeenCalled();
  });
});
