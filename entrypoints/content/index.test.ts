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
	probe: vi.fn(async () => ({
		comments: [{ id: 1, created: "2026-11-08T09:44:08Z" }],
	})),
	script: undefined as HTMLScriptElement | undefined,
}));

// 実装は style 注入時点で既に一致している要素にも animationstart を 1 回発火させる。
// happy-dom は CSS animation を走らせないので、その挙動を mock 側で再現する。
vi.mock("@/utils/on-element-appear", () => ({
	onElementAppear: (selector: string, callback: () => void) => {
		mocks.appear = callback;
		let stopped = false;
		setTimeout(() => {
			if (stopped) return;
			for (const _ of document.querySelectorAll(selector)) callback();
		}, 0);
		return () => {
			stopped = true;
			mocks.stopAppear();
		};
	},
}));
vi.mock("@/utils/fetch-issue-meta", () => ({ fetchIssueMeta: mocks.meta }));
vi.mock("@/utils/fetch-pull-request-probe", () => ({
	fetchPullRequestProbe: mocks.probe,
}));
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
	mocks.script.addEventListener("blu:request-state", () => {
		mocks.script?.dispatchEvent(
			new CustomEvent("blu:state", {
				detail: JSON.stringify({ found: true, issueId: 42, recentIds: [] }),
			}),
		);
	});
	await settingsStorage.setValue({
		...DEFAULT_SETTINGS,
		interval: 15,
		spaces: [{ key: "example", apiKey: "KEY", enabled: true }],
	});
	ctx = new ContentScriptContext("content-test");
});
afterEach(() => {
	ctx.notifyInvalidated();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function liveStates(): boolean[] {
	return vi
		.mocked(browser.runtime.sendMessage)
		.mock.calls.map(
			([message]) => (message as unknown as { active: boolean }).active,
		);
}

describe("監視の開始", () => {
	it("コメント欄が既にあるページで監視を始めても、baseline は 1 回だけ取得する", async () => {
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.meta).toHaveBeenCalledOnce();
	});

	it("コメント欄が既にあるページで監視を始めても、点いた badge は消えない", async () => {
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		await vi.advanceTimersByTimeAsync(0);
		const states = liveStates();
		expect(states).toContain(true);
		expect(states.slice(states.indexOf(true))).not.toContain(false);
	});

	it("コメント欄がある状態で設定を変えても、baseline の再取得は 1 回だけ", async () => {
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		await vi.advanceTimersByTimeAsync(0);
		mocks.meta.mockClear();
		await settingsStorage.setValue({
			interval: 30,
			spaces: [{ key: "example", apiKey: "NEW", enabled: true }],
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.meta).toHaveBeenCalledOnce();
	});
});

describe("content の寿命", () => {
	it("課題詳細から離れると polling と badge を停止する", async () => {
		await content.main(ctx);
		mocks.appear?.();
		location.pathname = "/dashboard";
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).not.toHaveBeenCalled();
		expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
			type: "live-state",
			active: false,
		});
	});

	it("遷移通知より先に新しい課題の監視が始まっても停止しない", async () => {
		await content.main(ctx);
		mocks.appear?.();
		location.pathname = "/view/P-2";
		mocks.appear?.();
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledOnce();
		expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
			type: "live-state",
			active: true,
		});
	});

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
		mocks.script?.addEventListener("blu:revalidate-issue", revalidate);
		await vi.advanceTimersByTimeAsync(15000);
		await settingsStorage.setValue({
			interval: 30,
			spaces: [{ key: "example", apiKey: "NEW", enabled: true }],
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
			spaces: [{ key: "example", apiKey: "KEY", enabled: true }],
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
			spaces: [{ key: "example", apiKey: "NEW", enabled: true }],
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
			spaces: [{ key: "example", apiKey: "NEW", enabled: true }],
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
			spaces: [{ key: "other", apiKey: "KEY", enabled: true }],
		});
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.comments).not.toHaveBeenCalled();
		expect(browser.runtime.sendMessage).toHaveBeenLastCalledWith({
			type: "live-state",
			active: false,
		});
		await settingsStorage.setValue({
			interval: 15,
			spaces: [{ key: "example", apiKey: "KEY", enabled: true }],
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

describe("複数スペースの設定", () => {
	it("先頭以外の有効な一致スペースの API キーを使う", async () => {
		await settingsStorage.setValue({
			interval: 15,
			spaces: [
				{ key: "other", apiKey: "OTHER", enabled: true },
				{ key: "example", apiKey: "MATCH", enabled: true },
			],
		});
		await content.main(ctx);
		mocks.appear?.();
		expect(createClient).toHaveBeenLastCalledWith(
			expect.objectContaining({ apiKey: "MATCH" }),
		);
	});
	it("無効なスペースではポーリングしない", async () => {
		await settingsStorage.setValue({
			interval: 15,
			spaces: [{ key: "example", apiKey: "KEY", enabled: false }],
		});
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		await vi.advanceTimersByTimeAsync(60000);
		expect(createClient).not.toHaveBeenCalled();
		expect(mocks.meta).not.toHaveBeenCalled();
		expect(mocks.comments).not.toHaveBeenCalled();
	});
	it("他スペースの追加と編集と無効化と削除では baseline と badge を作り直さない", async () => {
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		await vi.advanceTimersByTimeAsync(0);
		const current = { key: "example", apiKey: "KEY", enabled: true };
		const other = { key: "other", apiKey: "OTHER", enabled: true };
		const states = liveStates();
		for (const spaces of [
			[other, current],
			[{ ...other, apiKey: "NEW" }, current],
			[{ ...other, enabled: false }, current],
			[current],
		]) {
			await settingsStorage.setValue({ interval: 15, spaces });
			await vi.advanceTimersByTimeAsync(0);
		}
		expect(mocks.meta).toHaveBeenCalledOnce();
		expect(createClient).toHaveBeenCalledOnce();
		expect(liveStates()).toEqual(states);
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledOnce();
	});
	it("現在のスペースを無効化すると停止し有効化すると再開する", async () => {
		document.body.innerHTML = '<div id="comments"></div>';
		await content.main(ctx);
		const space = { key: "example", apiKey: "KEY", enabled: false };
		await settingsStorage.setValue({ interval: 15, spaces: [space] });
		await vi.advanceTimersByTimeAsync(30000);
		expect(mocks.comments).not.toHaveBeenCalled();
		expect(liveStates().at(-1)).toBe(false);
		await settingsStorage.setValue({
			interval: 15,
			spaces: [{ ...space, enabled: true }],
		});
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.comments).toHaveBeenCalledOnce();
	});
});

describe("PR ページの監視", () => {
	const watchPullRequest = async (apiKey = "KEY", key = "example") => {
		location.pathname = "/git/TEST/repo/pullRequests/1";
		document.body.innerHTML = '<div id="comments"></div>';
		await settingsStorage.setValue({
			interval: 15,
			spaces: [{ key, apiKey, enabled: true }],
		});
		const sync = vi.fn();
		mocks.script?.addEventListener("blu:sync-pull-request", sync);
		await content.main(ctx);
		return sync;
	};
	it("public API で取得した結果を渡して同期し、完了までは次の取得をしない", async () => {
		const sync = await watchPullRequest();
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.probe).toHaveBeenCalledTimes(1);
		expect(mocks.probe).toHaveBeenCalledWith(expect.anything(), {
			projectKey: "TEST",
			repoName: "repo",
			number: 1,
		});
		expect(sync).toHaveBeenCalledTimes(1);
		expect(liveStates()).toContain(true);
		expect(mocks.meta).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.probe).toHaveBeenCalledTimes(1);
		mocks.script?.dispatchEvent(new CustomEvent("blu:pull-request-synced"));
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.probe).toHaveBeenCalledTimes(2);
		ctx.notifyInvalidated();
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.probe).toHaveBeenCalledTimes(2);
	});
	it("コミット履歴やファイルのタブに切り替えても監視を続け、別の PR へ移ると止める", async () => {
		await watchPullRequest();
		await vi.advanceTimersByTimeAsync(15000);
		expect(mocks.probe).toHaveBeenCalledTimes(1);
		for (const tab of ["history", "diff"]) {
			location.pathname = `/git/TEST/repo/pullRequests/1/${tab}`;
			mocks.script?.dispatchEvent(new CustomEvent("blu:pull-request-synced"));
			await vi.advanceTimersByTimeAsync(15000);
		}
		expect(mocks.probe).toHaveBeenCalledTimes(3);
		expect(liveStates().at(-1)).toBe(true);
		location.pathname = "/git/TEST/repo/pullRequests/2";
		mocks.script?.dispatchEvent(new CustomEvent("blu:pull-request-synced"));
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.probe).toHaveBeenCalledTimes(3);
	});
	it("MAIN world へ渡すイベントに API キーを含めない", async () => {
		const sync = await watchPullRequest("SECRET-KEY");
		await vi.advanceTimersByTimeAsync(15000);
		const event = sync.mock.calls[0]?.[0] as CustomEvent;
		expect(JSON.parse(event.detail)).toEqual(
			await mocks.probe.mock.results[0]?.value,
		);
		expect(String(event.detail)).not.toContain("SECRET-KEY");
	});
	it("API キーが無ければ PR を監視しない", async () => {
		const sync = await watchPullRequest("");
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.probe).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(liveStates()).not.toContain(true);
	});
	it("対象外の Space では PR を監視しない", async () => {
		const sync = await watchPullRequest("KEY", "other");
		await vi.advanceTimersByTimeAsync(60000);
		expect(mocks.probe).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
	});
	it("public API の取得に失敗した tick ではページへ同期を依頼しない", async () => {
		mocks.probe.mockResolvedValueOnce(null as never);
		const sync = await watchPullRequest();
		await vi.advanceTimersByTimeAsync(15000);
		expect(sync).not.toHaveBeenCalled();
	});
});
