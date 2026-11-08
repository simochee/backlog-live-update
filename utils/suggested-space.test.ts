import { beforeEach, expect, it } from "vite-plus/test";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { parseSuggestedSpace, suggestedSpaceStorage } from "./suggested-space";

beforeEach(() => fakeBrowser.reset());

it.each([
	"backlog.com",
	"backlog.jp",
	"backlogtool.com",
])("Backlog の URL からキーと origin だけを取り出す (%s)", (domain) => {
	expect(
		parseSuggestedSpace(`https://NULAB.${domain}/view/P-1?q=secret`),
	).toEqual({
		key: "nulab",
		origin: `https://nulab.${domain}`,
	});
});

it.each([
	undefined,
	"",
	"nulab",
	"nulab.backlog.jp",
	"https://example.com",
	"https://nulab.backlog.jp.evil.com",
	"https://a.b.backlog.com",
	"https://user:pass@nulab.backlog.com",
	"https://nulab.backlog.com:8080",
	"file:///nulab.backlog.com",
])("Backlog タブの URL でなければ提案しない (%s)", (url) => {
	expect(parseSuggestedSpace(url)).toBeNull();
});

it("提案は session に保存し消去すると未設定に戻る", async () => {
	expect(await suggestedSpaceStorage.getValue()).toBeNull();
	const suggestion = parseSuggestedSpace("https://nulab.backlog.jp/view/P-1");
	await suggestedSpaceStorage.setValue(suggestion);
	expect(await fakeBrowser.storage.session.get("suggestedSpace")).toEqual({
		suggestedSpace: suggestion,
	});
	expect(await fakeBrowser.storage.local.get("suggestedSpace")).toEqual({});
	await suggestedSpaceStorage.setValue(null);
	expect(await suggestedSpaceStorage.getValue()).toBeNull();
});
