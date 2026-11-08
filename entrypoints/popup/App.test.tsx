import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { Settings } from "@/utils/settings";

const saved: Settings = {
	interval: 30,
	space: { key: "example", apiKey: "secret" },
};
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	vi.resetModules();
	fakeBrowser.reset();
	await fakeBrowser.storage.local.set({ settings: saved, settings$: { v: 3 } });
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(() => root.unmount());
	container.remove();
});

async function renderApp() {
	const { App } = await import("./App");
	await act(() => {
		root.render(
			<Suspense fallback={<p>Loading...</p>}>
				<App />
			</Suspense>,
		);
	});
}

function input(id: string): HTMLInputElement {
	const element = container.querySelector(`#${id}`);
	if (!(element instanceof HTMLInputElement))
		throw new Error(`Missing input ${id}`);
	return element;
}

async function changeText(id: string, value: string) {
	await act(() => {
		const element = input(id);
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set?.call(element, value);
		element.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

it("保存済みの設定がフォームの初期値に入る", async () => {
	await renderApp();
	expect(input("space-key").value).toBe("example");
	expect(input("api-key").value).toBe("secret");
	expect(container.querySelector<HTMLSelectElement>("#interval")?.value).toBe(
		"30",
	);
	for (const element of container.querySelectorAll("input, select")) {
		expect(
			container.querySelector(`label[for="${element.id}"]`),
		).not.toBeNull();
	}
	expect(
		Array.from(
			container.querySelectorAll("h2"),
			(element) => element.textContent,
		),
	).toEqual(["Space", "Preferences"]);
	expect(
		Array.from(
			container.querySelectorAll("option"),
			(element) => element.textContent,
		),
	).toEqual(["15s", "30s", "60s", "5m", "10m"]);
});

it("Interval を変えると他の設定を保って storage に保存される", async () => {
	await renderApp();
	await act(() => {
		const element = container.querySelector<HTMLSelectElement>("#interval");
		if (!element) throw new Error("Missing interval");
		element.value = "300";
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
	expect(await fakeBrowser.storage.local.get("settings")).toEqual({
		settings: { ...saved, interval: 300 },
	});
});

it("Space Key と API Key は入力のたびに storage に保存される", async () => {
	await renderApp();
	await changeText("space-key", "updated");
	await changeText("api-key", "new-secret");
	expect(await fakeBrowser.storage.local.get("settings")).toEqual({
		settings: { ...saved, space: { key: "updated", apiKey: "new-secret" } },
	});
});

it("API Key は既定で伏せ字表示されボタンで表示を切り替えられる", async () => {
	await renderApp();
	expect(input("api-key").type).toBe("password");
	expect(input("api-key").autocomplete).toBe("off");
	const button = container.querySelector("button");
	if (!button) throw new Error("Missing visibility button");
	await act(() => button.click());
	expect(input("api-key").type).toBe("text");
	expect(button.getAttribute("aria-pressed")).toBe("true");
	await act(() => button.click());
	expect(input("api-key").type).toBe("password");
	expect(await fakeBrowser.storage.local.get("settings")).toEqual({
		settings: saved,
	});
});
