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
