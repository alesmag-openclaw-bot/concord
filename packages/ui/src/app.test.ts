import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import App from "./App.vue";

const EmptyView = { template: "<div />" };

function buildRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: EmptyView },
      { path: "/events", name: "events", component: EmptyView },
      { path: "/runs", name: "runs", component: EmptyView },
      { path: "/runs/:id", name: "run-detail", component: EmptyView },
      { path: "/logs", name: "logs", component: EmptyView },
      { path: "/producers", name: "producers", component: EmptyView },
      { path: "/consumers", name: "consumers", component: EmptyView },
      { path: "/contexts", name: "contexts", component: EmptyView },
      { path: "/login", name: "login", component: EmptyView },
    ],
  });
}

async function mountApp(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = buildRouter();
  await router.push("/");
  const wrapper = mount(App, {
    global: {
      plugins: [router, createPinia()],
      stubs: {
        FontAwesomeIcon: true,
        RouterView: EmptyView,
      },
    },
  });
  await router.isReady();
  await flushPromises();
  return { wrapper, router };
}

describe("App shell — mobile sidebar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("hides the closed sidebar from painting and hit-testing so the nav rail stays usable", async () => {
    const { wrapper } = await mountApp();

    const aside = wrapper.find("aside");
    expect(aside.exists()).toBe(true);
    expect(aside.classes()).toContain("invisible");
    expect(aside.classes()).toContain("-translate-x-full");
  });

  it("exposes a hamburger that opens the sidebar overlay", async () => {
    const { wrapper } = await mountApp();

    const hamburger = wrapper.find('button[aria-label="Toggle navigation"]');
    expect(hamburger.exists()).toBe(true);

    await hamburger.trigger("click");

    const aside = wrapper.find("aside");
    expect(aside.classes()).toContain("visible");
    expect(aside.classes()).toContain("translate-x-0");

    // The backdrop closes it again.
    const backdrop = wrapper.find(".bg-black\\/40");
    expect(backdrop.exists()).toBe(true);
    await backdrop.trigger("click");
    expect(wrapper.find("aside").classes()).toContain("invisible");
  });

  it("closes the sidebar when a navigation link inside it is clicked", async () => {
    const { wrapper } = await mountApp();

    await wrapper.find('button[aria-label="Toggle navigation"]').trigger("click");
    expect(wrapper.find("aside").classes()).toContain("visible");

    const runsLink = wrapper.findAll("a").find((link) => link.text() === "Runs");
    expect(runsLink).toBeDefined();
    await runsLink!.trigger("click");
    await flushPromises();

    expect(wrapper.find("aside").classes()).toContain("invisible");
  });
});
