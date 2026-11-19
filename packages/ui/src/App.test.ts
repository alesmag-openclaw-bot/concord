import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { createPinia } from "pinia";
import App from "./App.vue";

// jsdom has no layout engine, so the shell's grid geometry (nav rail column,
// sidebar overlay) cannot be measured. The regression tests below pin the
// class-level contract instead: the closed mobile drawer must translate far
// enough left to clear the viewport. The drawer is anchored at the nav rail's
// right edge (left: var(--spacing-nav-rail), 3.5rem) and is 16rem wide, so
// translating by its own width alone (-translate-x-full) leaves a 3.5rem strip
// on screen at z-40 that covers the nav rail — the overlap bug.
const OFF_SCREEN_CLOSED = "-translate-x-[calc(100%_+_var(--spacing-nav-rail))]";
const RAIL_ANCHOR = "left-[var(--spacing-nav-rail)]";

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { paused: false, peakHours: null } }),
    })),
  );
}

function stubMatchMedia(mobile: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 767px)" ? mobile : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

async function mountShell(): Promise<VueWrapper> {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { render: () => null } },
      { path: "/events", name: "events", component: { render: () => null } },
      { path: "/runs", name: "runs", component: { render: () => null } },
      { path: "/logs", name: "logs", component: { render: () => null } },
      { path: "/producers", name: "producers", component: { render: () => null } },
      { path: "/login", name: "login", component: { render: () => null } },
    ],
  });
  await router.push("/");
  await router.isReady();
  return mount(App, {
    global: {
      plugins: [router, createPinia()],
    },
  });
}

function asideClasses(wrapper: VueWrapper): string {
  const classes = wrapper.get("aside").attributes("class") ?? "";
  return classes;
}

describe("App shell", () => {
  beforeEach(() => {
    stubFetch();
    stubMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("anchors the closed mobile sidebar beside the nav rail and translates it fully off-screen", async () => {
    const wrapper = await mountShell();

    const classes = asideClasses(wrapper);
    // The drawer stays anchored at the rail's right edge when it slides in…
    expect(classes).toContain(RAIL_ANCHOR);
    // …but when closed it must clear the viewport completely: its own width
    // plus the rail offset. A bare -translate-x-full would leave the drawer's
    // right edge exactly at the rail, overlapping it.
    expect(classes).toContain(OFF_SCREEN_CLOSED);
    expect(classes).toContain("md:translate-x-0");
  });

  it("opens the sidebar as an overlay from a rail tap on mobile and closes it again", async () => {
    const wrapper = await mountShell();

    // Already on the main section, so a rail tap toggles the overlay open.
    await wrapper.get('button[aria-label="Concord"]').trigger("click");

    const open = asideClasses(wrapper);
    expect(open).toContain("translate-x-0");
    expect(open).not.toContain(OFF_SCREEN_CLOSED);
    expect(wrapper.find('[class*="bg-black/40"]').exists()).toBe(true);

    // Tapping the backdrop closes the overlay and restores the off-screen
    // transform.
    await wrapper.get('[class*="bg-black/40"]').trigger("click");
    const closed = asideClasses(wrapper);
    expect(closed).toContain(OFF_SCREEN_CLOSED);
    expect(closed).not.toContain("translate-x-0 shadow-xl");
    expect(wrapper.find('[class*="bg-black/40"]').exists()).toBe(false);
  });
});
