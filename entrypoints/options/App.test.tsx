import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { Settings } from "@/utils/settings";

const saved: Settings = {
	interval: 30,
	spaces: [{ key: "example", apiKey: "secret", enabled: true }],
};
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	vi.resetModules();
	fakeBrowser.reset();
	await fakeBrowser.storage.local.set({ settings: saved, settings$: { v: 4 } });
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(() => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

async function renderApp() {
	await act(async () => {
		const { App } = await import("./App");
		root.render(
			<Suspense fallback={<p>Loading...</p>}>
				<App />
			</Suspense>,
		);
	});
}

function input(id: string): HTMLInputElement {
	const element = container.querySelector(
		id === "api-key" ? ".secret-field input" : `#${id}`,
	);
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

function button(label: string): HTMLButtonElement {
	const found = [...container.querySelectorAll("button")].find(
		(element) =>
			element.getAttribute("aria-label") === label ||
			[...element.childNodes]
				.filter(
					(node) =>
						!(
							node instanceof Element &&
							node.getAttribute("aria-hidden") === "true"
						),
				)
				.map((node) => node.textContent)
				.join("") === label,
	);
	if (!found) throw new Error(`Missing button ${label}`);
	return found;
}
async function click(label: string) {
	await act(() => button(label).click());
}
function spaceButton(key: string): HTMLButtonElement {
	const element = [
		...container.querySelectorAll<HTMLButtonElement>(".space-link"),
	].find(
		(button) => button.querySelector(".row-text > span")?.textContent === key,
	);
	if (!element) throw new Error(`Missing space ${key}`);
	return element;
}
async function openSpace(key: string) {
	await act(() => spaceButton(key).click());
}
async function stored() {
	return (await fakeBrowser.storage.local.get("settings")).settings as Settings;
}

it("スペース一覧と間隔の選択肢を表示する", async () => {
	await renderApp();
	expect(container.textContent).toContain("Live for Backlog");
	expect(container.textContent).toContain("example");
	expect(container.textContent).toContain("Enabled");
	expect(container.querySelector<HTMLSelectElement>("#interval")?.value).toBe(
		"30",
	);
	expect(
		[...container.querySelectorAll("h2")].map((element) => element.textContent),
	).toEqual(["Spaces", "Preferences"]);
	expect(
		[...container.querySelectorAll("option")].map(
			(element) => element.textContent,
		),
	).toEqual(["15s", "30s", "60s", "5m", "10m"]);
});
it("空の一覧には案内を表示する", async () => {
	await fakeBrowser.storage.local.set({
		settings: { interval: 60, spaces: [] },
	});
	await renderApp();
	expect(container.textContent).toContain("No spaces added");
	expect(button("Add space")).toBeDefined();
});
it("停止中と API キー未入力の状態を表示する", async () => {
	await fakeBrowser.storage.local.set({
		settings: {
			interval: 60,
			spaces: [
				{ key: "paused", apiKey: "secret", enabled: false },
				{ key: "missing", apiKey: "", enabled: true },
			],
		},
	});
	await renderApp();
	expect(container.textContent).toContain("Paused");
	expect(container.textContent).toContain("API Key not set");
});
it("間隔を変えるとスペースを保って保存する", async () => {
	await renderApp();
	await act(() => {
		const element = container.querySelector<HTMLSelectElement>("#interval");
		if (!element) throw new Error("Missing interval");
		element.value = "300";
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
	expect(await stored()).toEqual({ ...saved, interval: 300 });
});
it("一覧のスイッチは詳細を開かず有効状態を保存する", async () => {
	await renderApp();
	await act(() =>
		container.querySelector<HTMLInputElement>('[role="switch"]')?.click(),
	);
	expect(await stored()).toEqual({
		...saved,
		spaces: [{ ...saved.spaces[0], enabled: false }],
	});
	expect(container.querySelector("h1")?.textContent).toBe("Live for Backlog");
	expect(container.textContent).toContain("Paused");
});
it("URL 入力から新しいスペースを追加し既存設定を保つ", async () => {
	await renderApp();
	await click("Add space");
	expect(button("Add").disabled).toBe(true);
	await changeText("space-key", "https://nulab.backlog.jp/view/ABC-1");
	expect(container.querySelector("a")?.href).toBe(
		"https://nulab.backlog.jp/EditApiSettings.action",
	);
	await changeText("api-key", "new-secret");
	expect(await stored()).toEqual(saved);
	await click("Add");
	expect(await stored()).toEqual({
		...saved,
		spaces: [
			...saved.spaces,
			{ key: "nulab", apiKey: "new-secret", enabled: true },
		],
	});
	expect(container.querySelector("form")).toBeNull();
	expect(document.activeElement).toBe(button("Add space"));
});
it("既存キーと外部 URL では追加できない", async () => {
	await renderApp();
	await click("Add space");
	await changeText("space-key", "example.backlog.com");
	expect(container.querySelector('[role="alert"]')?.textContent).toBe(
		"This space is already added",
	);
	expect(button("Add").disabled).toBe(true);
	await changeText("space-key", "https://evil.com");
	expect(button("Add").disabled).toBe(true);
	expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("追加をキャンセルすると入力を保存しない", async () => {
	await renderApp();
	await click("Add space");
	await changeText("space-key", "draft");
	await click("Cancel");
	expect(await stored()).toEqual(saved);
	expect(container.querySelector("h1")?.textContent).toBe("Live for Backlog");
});
it("展開した行の API キーを自動保存し同じ行で有効状態を切り替える", async () => {
	await renderApp();
	await openSpace("example");
	expect(container.querySelector("h1")?.textContent).toBe("Live for Backlog");
	expect(container.querySelector("#space-key")).toBeNull();
	expect(input("api-key").value).toBe("secret");
	await changeText("api-key", "new-secret");
	await act(() =>
		container.querySelector<HTMLInputElement>('[role="switch"]')?.click(),
	);
	expect(await stored()).toEqual({
		...saved,
		spaces: [{ key: "example", apiKey: "new-secret", enabled: false }],
	});
	expect(container.textContent).toContain("Paused");
});
it("API キーの表示切り替えは保存せずパスワードマネージャーから除外する", async () => {
	await renderApp();
	await openSpace("example");
	expect(input("api-key").type).toBe("password");
	expect(input("api-key").autocomplete).toBe("off");
	expect(input("api-key").hasAttribute("data-1p-ignore")).toBe(true);
	expect(input("api-key").getAttribute("data-lpignore")).toBe("true");
	await click("Show API Key");
	expect(input("api-key").type).toBe("text");
	expect(button("Show API Key").getAttribute("aria-pressed")).toBe("true");
	expect(button("Show API Key").getAttribute("aria-controls")).toBe(
		input("api-key").id,
	);
	await click("Show API Key");
	expect(input("api-key").type).toBe("password");
	expect(await stored()).toEqual(saved);
});
it("削除を確認してからスペースだけを削除し一覧へ戻る", async () => {
	await fakeBrowser.storage.local.set({
		settings: {
			...saved,
			spaces: [...saved.spaces, { key: "other", apiKey: "", enabled: true }],
		},
	});
	await renderApp();
	await openSpace("example");
	await click("Remove");
	expect(container.textContent).toContain("Remove example?");
	await click("Cancel");
	expect((await stored()).spaces).toHaveLength(2);
	await click("Remove");
	await click("Remove");
	expect(await stored()).toEqual({
		...saved,
		spaces: [{ key: "other", apiKey: "", enabled: true }],
	});
	expect(container.querySelector("h1")?.textContent).toBe("Live for Backlog");
});
it("クリック元のスペースを session storage から提案し API 設定を新しいタブで開く", async () => {
	await fakeBrowser.storage.session.set({
		suggestedSpace: { key: "nulab", origin: "https://nulab.backlog.jp" },
	});
	await renderApp();
	await click("Add nulab");
	expect(input("space-key").value).toBe("nulab");
	expect(container.textContent).not.toContain("Add nulab");
	expect(container.querySelector("a")?.href).toBe(
		"https://nulab.backlog.jp/EditApiSettings.action",
	);
	expect(container.querySelector("a")?.target).toBe("_blank");
	await changeText("space-key", "different");
	expect(container.querySelector("a")).toBeNull();
});
it("開いたまま別のスペースをクリックすると提案が更新され外部タブでは消える", async () => {
	await renderApp();
	await act(() =>
		fakeBrowser.storage.session.set({
			suggestedSpace: { key: "nulab", origin: "https://nulab.backlog.jp" },
		}),
	);
	expect(button("Add nulab")).toBeDefined();
	await act(() =>
		fakeBrowser.storage.session.set({
			suggestedSpace: { key: "other", origin: "https://other.backlog.com" },
		}),
	);
	expect(container.textContent).not.toContain("Add nulab");
	expect(button("Add other")).toBeDefined();
	await act(() => fakeBrowser.storage.session.remove("suggestedSpace"));
	expect(container.textContent).not.toContain("Add other");
});
it("登録済みスペースは提案せず新規登録後も提案を隠す", async () => {
	await fakeBrowser.storage.session.set({
		suggestedSpace: { key: "example", origin: "https://example.backlog.com" },
	});
	await renderApp();
	expect(container.textContent).not.toContain("Add example");
	await act(() =>
		fakeBrowser.storage.session.set({
			suggestedSpace: { key: "other", origin: "https://other.backlog.com" },
		}),
	);
	await click("Add other");
	await click("Add");
	expect(container.textContent).not.toContain("Add other");
	expect((await stored()).spaces.some((space) => space.key === "other")).toBe(
		true,
	);
});
it("提案がなくても手動でスペースを追加できる", async () => {
	await renderApp();
	await click("Add space");
	expect(input("space-key").value).toBe("");
	expect(container.querySelector("a")).toBeNull();
});
it("保存失敗の警告を表示し次の保存成功で消す", async () => {
	await renderApp();
	await openSpace("example");
	const { settingsStorage } = await import("@/utils/settings");
	vi.spyOn(settingsStorage, "setValue").mockRejectedValueOnce(
		new Error("failed"),
	);
	await changeText("api-key", "failed");
	expect(container.querySelector('[role="alert"]')?.textContent).toContain(
		"Could not save settings",
	);
	await changeText("api-key", "success");
	expect(container.querySelector('[role="alert"]')).toBeNull();
	expect((await stored()).spaces[0]?.apiKey).toBe("success");
});

it("スペース行のアクセシブルな名前はキーと状態の表示を使う", async () => {
	await renderApp();
	const row = spaceButton("example");
	expect(row.hasAttribute("aria-label")).toBe(false);
	expect(row.textContent).toContain("example");
	expect(row.textContent).toContain("Enabled");
});
it("追加フォームはキー入力にフォーカスしキャンセル後は追加ボタンを復元する", async () => {
	await renderApp();
	await click("Add space");
	expect(document.activeElement).toBe(input("space-key"));
	expect(container.textContent).toContain("Preferences");
	expect(
		[...container.querySelectorAll("button")].some(
			(entry) => entry.textContent === "Add space",
		),
	).toBe(false);
	await changeText("space-key", "draft");
	await click("Cancel");
	expect(container.querySelector("form")).toBeNull();
	expect(document.activeElement).toBe(button("Add space"));
	expect(await stored()).toEqual(saved);
	await click("Add space");
	expect(input("space-key").value).toBe("");
});
it("行を再クリックすると閉じ別の行を開くと元の編集欄は閉じる", async () => {
	await fakeBrowser.storage.local.set({
		settings: {
			...saved,
			spaces: [...saved.spaces, { key: "other", apiKey: "", enabled: true }],
		},
	});
	await renderApp();
	const row = spaceButton("example");
	expect(row.getAttribute("aria-expanded")).toBe("false");
	await openSpace("example");
	expect(row.getAttribute("aria-expanded")).toBe("true");
	expect(
		document.getElementById(row.getAttribute("aria-controls") ?? "")?.hidden,
	).toBe(false);
	await openSpace("example");
	expect(row.getAttribute("aria-expanded")).toBe("false");
	expect(container.querySelector(".secret-field")).toBeNull();
	await openSpace("example");
	await openSpace("other");
	expect(row.getAttribute("aria-expanded")).toBe("false");
	expect(spaceButton("other").getAttribute("aria-expanded")).toBe("true");
});
it("削除後は追加ボタンへフォーカスを移す", async () => {
	await renderApp();
	await openSpace("example");
	await click("Remove");
	await click("Remove");
	expect(document.activeElement).toBe(button("Add space"));
});
it("編集欄と追加フォームを同時に開いても API キーのラベルはそれぞれの入力を指す", async () => {
	await renderApp();
	await openSpace("example");
	await click("Add space");
	const fields = [
		...container.querySelectorAll<HTMLInputElement>(".secret-field input"),
	];
	expect(fields).toHaveLength(2);
	expect(fields[0]?.id).not.toBe(fields[1]?.id);
	for (const field of fields) {
		expect(
			container.querySelector(`label[for="${field.id}"]`)?.textContent,
		).toBe("API Key");
		expect(
			container.querySelector(`button[aria-controls="${field.id}"]`),
		).not.toBeNull();
	}
});
