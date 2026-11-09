import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "@/entrypoints/background";

beforeEach(() => {
	fakeBrowser.reset();
	vi.spyOn(browser.runtime, "openOptionsPage").mockResolvedValue();
	background.main();
});
afterEach(() => vi.restoreAllMocks());

it("ツールバーのアイコンをクリックすると設定ページを開く", async () => {
	const tab = await fakeBrowser.tabs.create({
		url: "https://nulab.backlog.jp/view/P-1",
	});
	await fakeBrowser.action.onClicked.trigger(tab);
	expect(browser.runtime.openOptionsPage).toHaveBeenCalledOnce();
});

it("ライブ状態の通知で従来どおり赤いバッジを表示し停止時に消す", async () => {
	const color = vi
		.spyOn(browser.action, "setBadgeBackgroundColor")
		.mockResolvedValue();
	const text = vi.spyOn(browser.action, "setBadgeText").mockResolvedValue();
	const tab = await fakeBrowser.tabs.create({
		url: "https://nulab.backlog.jp/",
	});
	await fakeBrowser.runtime.onMessage.trigger(
		{ type: "live-state", active: true },
		{ tab },
		() => {},
	);
	expect(color).toHaveBeenCalledWith({ tabId: tab.id, color: "#f42858" });
	expect(text).toHaveBeenCalledWith({ tabId: tab.id, text: " " });
	await fakeBrowser.runtime.onMessage.trigger(
		{ type: "live-state", active: false },
		{ tab },
		() => {},
	);
	expect(text).toHaveBeenLastCalledWith({ tabId: tab.id, text: "" });
	expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
});
