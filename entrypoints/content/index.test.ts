import { createClient } from "backlog-js";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vite-plus/test";
import { browser } from "wxt/browser";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { DEFAULT_SETTINGS, settingsStorage } from "@/utils/settings";
import content from "./index";

const mocks = vi.hoisted(() => ({
	appear: undefined as undefined | (() => void),
	stopAppear: vi.fn(),
	meta: vi.fn(async () => ({ id: 42, updated: "2026-01-01" })),
	comments: vi.fn(async () => []),
	script: undefined as HTMLScriptElement | undefined,
}));

vi.mock("@/utils/on-element-appear", () => ({
	onElementAppear: (_selector: string, callback: () => void) => {
		mocks.appear = callback;
		return mocks.stopAppear;
	},
}));
vi.mock("@/utils/fetch-issue-meta", () => ({ fetchIssueMeta: mocks.meta }));
vi.mock("backlog-js", () => ({
	createClient: vi.fn(() => ({})),
	getIssueComments: mocks.comments,
}));
vi.mock("wxt/utils/inject-script", () => ({
	injectScript: async () => ({ script: mocks.script }),
}));

let ctx: ContentScriptContext;
beforeEach(async () => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	document.body.replaceChildren();
	vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(undefined);
	vi.stubGlobal("location", new URL("https://example.backlog.com/view/P-1"));
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	mocks.script = document.createElement("script");
	mocks.script.addEventListener("lfb:request-state", () => {
		mocks.script?.dispatchEvent(
			new CustomEvent("lfb:state", {
				detail: JSON.stringify({ found: true, issueId: 42, recentIds: [] }),
			}),
		);
	});
	await settingsStorage.setValue({
		...DEFAULT_SETTINGS,
		interval: 15,
		space: { key: "example", apiKey: "KEY" },
	});
	ctx = new ContentScriptContext("content-test");
});
afterEach(() => {
	ctx.notifyInvalidated();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("content の寿命", () => {
	it("拡張 API が無効化で同期エラーになっても監視を解除する", async () => {
		await content.main(ctx);
		mocks.appear?.();
		vi.mocked(browser.runtime.sendMessage).mockImplementation(() => {
			throw new Error("Extension context invalidated");
		});
		expect(() => ctx.notifyInvalidated()).not.toThrow();
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.stopAppear).toHaveBeenCalledOnce();
		expect(mocks.comments).not.toHaveBeenCalled();
	});

	it("設定変更前の通信が後から完了してもページを再検証しない", async () => {
		await content.main(ctx);
		mocks.appear?.();
		await vi.advanceTimersByTimeAsync(0);
		let complete:
			| ((value: { id: number; updated: string }) => void)
			| undefined;
		mocks.meta.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		const revalidate = vi.fn();
		mocks.script?.addEventListener("lfb:revalidate-issue", revalidate);
		await vi.advanceTimersByTimeAsync(15000);
		await settingsStorage.setValue({
			interval: 30,
			space: { key: "example", apiKey: "NEW" },
		});
		await vi.advanceTimersByTimeAsync(0);
		complete?.({ id: 42, updated: "2027-01-01" });
		await vi.advanceTimersByTimeAsync(0);
		expect(revalidate).not.toHaveBeenCalled();
	});

	it("起動時に対象外の Space でも、設定が一致すれば監視を始める", async () => {
		await settingsStorage.setValue(DEFAULT_SETTINGS);
		await content.main(ctx);
		document.body.innerHTML = '<div id="comments"></div>';
		await settingsStorage.setValue({
			interval: 15,
			space: { key: "example", apiKey: "KEY" },
		});
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledOnce();
	});

	it("無効化後の設定変更では監視を再開しない", async () => {
		await content.main(ctx);
		ctx.notifyInvalidated();
		vi.mocked(createClient).mockClear();
		await settingsStorage.setValue({
			interval: 30,
			space: { key: "example", apiKey: "NEW" },
		});
		await vi.advanceTimersByTimeAsync(30000);
		expect(createClient).not.toHaveBeenCalled();
		expect(mocks.comments).not.toHaveBeenCalled();
	});

	it("設定変更後は新しい間隔と API キーで取得する", async () => {
		await content.main(ctx);
		document.body.innerHTML = '<div id="comments"></div>';
		mocks.appear?.();
		await vi.advanceTimersByTimeAsync(10000);
		await settingsStorage.setValue({
			interval: 30,
			space: { key: "example", apiKey: "NEW" },
		});
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(29999);
		expect(mocks.comments).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(mocks.comments).toHaveBeenCalledOnce();
		expect(createClient).toHaveBeenLastCalledWith(
			expect.objectContaining({ apiKey: "NEW" }),
		);
	});

	it("Space Key がホストと違えば停止し、一致する設定に戻れば再開する", async () => {
		await content.main(ctx);
		document.body.innerHTML = '<div id="comments"></div>';
		mocks.appear?.();
		await settingsStorage.setValue({
			interval: 15,
			space: { key: "other", apiKey: "KEY" },
		});
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.comments).not.toHaveBeenCalled();
		expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
			type: "live-state",
			active: false,
		});
		await settingsStorage.setValue({
			interval: 15,
			space: { key: "example", apiKey: "KEY" },
		});
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledOnce();
	});

	it("無効化後は API を再取得せず、要素の監視と badge を解除する", async () => {
		await content.main(ctx);
		mocks.appear?.();
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledTimes(1);
		ctx.notifyInvalidated();
		const count = mocks.meta.mock.calls.length;
		await vi.advanceTimersByTimeAsync(60000);
		mocks.appear?.();
		expect(mocks.comments).toHaveBeenCalledTimes(1);
		expect(mocks.meta).toHaveBeenCalledTimes(count);
		expect(mocks.stopAppear).toHaveBeenCalledOnce();
		expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
			type: "live-state",
			active: false,
		});
	});
});
