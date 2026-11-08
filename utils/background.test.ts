import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import background from "@/entrypoints/background";
import { suggestedSpaceStorage } from "@/utils/suggested-space";

beforeEach(() => {
	fakeBrowser.reset();
	vi.spyOn(browser.runtime, "openOptionsPage").mockResolvedValue();
	background.main();
});
afterEach(() => vi.restoreAllMocks());

async function clickAction(url?: string) {
	const tab = await fakeBrowser.tabs.create({ url });
	await fakeBrowser.action.onClicked.trigger(tab);
}

it("起動直後にクリックを受け付け提案の保存後に設定ページを開く", async () => {
	vi.mocked(browser.runtime.openOptionsPage).mockImplementation(async () => {
		expect(await suggestedSpaceStorage.getValue()).toEqual({
			key: "nulab",
			origin: "https://nulab.backlog.jp",
		});
	});
	await clickAction("https://nulab.backlog.jp/view/P-1");
	expect(browser.runtime.openOptionsPage).toHaveBeenCalledOnce();
});

it.each([
	undefined,
	"https://example.com/",
])("Backlog 以外のタブでは以前の提案を消して設定ページを開く (%s)", async (url) => {
	await suggestedSpaceStorage.setValue({
		key: "old",
		origin: "https://old.backlog.com",
	});
	await clickAction(url);
	expect(await suggestedSpaceStorage.getValue()).toBeNull();
	expect(browser.runtime.openOptionsPage).toHaveBeenCalledOnce();
});

it("別の Backlog タブをクリックすると最新の提案に置き換える", async () => {
	await clickAction("https://first.backlog.com/view/P-1");
	await clickAction("https://second.backlogtool.com/view/P-2");
	expect(await suggestedSpaceStorage.getValue()).toEqual({
		key: "second",
		origin: "https://second.backlogtool.com",
	});
	expect(browser.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
});

it("提案の保存に失敗しても設定ページを開く", async () => {
	vi.spyOn(suggestedSpaceStorage, "setValue").mockRejectedValueOnce(
		new Error("unavailable"),
	);
	await clickAction("https://nulab.backlog.jp/");
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
