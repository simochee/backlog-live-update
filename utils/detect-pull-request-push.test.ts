import { createClient } from "backlog-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { jsonResponse } from "../test/fetch-mock";
import {
	createPushDetector,
	MAX_ACTIVITY_LAG_TICKS,
	type PushTarget,
} from "./detect-pull-request-push";
import { fetchWithoutCache } from "./fetch-without-cache";

afterEach(() => {
	vi.unstubAllGlobals();
});

const T0 = "2026-11-08T09:00:00Z";
const T1 = "2026-11-08T09:10:00Z";
const T2 = "2026-11-08T09:20:00Z";

const target = (pushedAt: string | null): PushTarget => ({
	pushedAt,
	repositoryId: 5,
	branch: "topic",
	base: "main",
});
const activity = (created: string, ref: string, repositoryId = 5) => ({
	id: 1,
	type: 12,
	created,
	content: { repository: { id: repositoryId }, ref },
});

function setup(initial: unknown[] = []) {
	let body: unknown = initial;
	let ok = true;
	const fn = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
		Promise.resolve(jsonResponse(body, ok)),
	);
	vi.stubGlobal("fetch", fn);
	const detect = createPushDetector(
		createClient({
			host: "example.backlog.com",
			apiKey: "KEY",
			fetch: fetchWithoutCache,
		}),
		"TEST",
	);
	return {
		fn,
		detect,
		serve: (next: unknown[]) => {
			body = next;
		},
		fail: (value: boolean) => {
			ok = !value;
		},
	};
}

describe("PR のブランチへの push の検知", () => {
	it("初回は基準値を記録するだけでアクティビティを取らない", async () => {
		const { detect, fn } = setup();
		expect(await detect(target(T0))).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});

	it("最終 push 日時が進まない tick ではアクティビティを取らない", async () => {
		const { detect, fn } = setup();
		await detect(target(T0));
		expect(await detect(target(T0))).toBe(false);
		expect(await detect(target(null))).toBe(false);
		expect(fn).not.toHaveBeenCalled();
	});

	it("関係ないブランチへの push では履歴を取り直さず基準値を進める", async () => {
		const { detect, serve, fn } = setup();
		await detect(target(T0));
		serve([activity(T1, "refs/heads/other")]);
		expect(await detect(target(T1))).toBe(false);
		expect(await detect(target(T1))).toBe(false);
		expect(fn).toHaveBeenCalledOnce();
	});

	it("PR の branch への push では履歴を取り直す", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve([activity(T1, "refs/heads/topic")]);
		expect(await detect(target(T1))).toBe(true);
	});

	it("PR の base への push では履歴を取り直す", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve([activity(T1, "refs/heads/main"), activity(T0, "refs/heads/x")]);
		expect(await detect(target(T1))).toBe(true);
	});

	it("基準値以前の push は無視する", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve([activity(T1, "refs/heads/other"), activity(T0, "refs/heads/topic")]);
		expect(await detect(target(T1))).toBe(false);
	});

	it("別リポジトリの同名ブランチへの push は無視する", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve([
			activity(T1, "refs/heads/topic", 99),
			activity(T1, "refs/heads/other"),
		]);
		expect(await detect(target(T1))).toBe(false);
	});

	it("アクティビティの取得に失敗したら基準値を進めず次の tick で取り直す", async () => {
		const { detect, serve, fail, fn } = setup();
		await detect(target(T0));
		fail(true);
		expect(await detect(target(T1))).toBe(false);
		fail(false);
		serve([activity(T1, "refs/heads/topic")]);
		expect(await detect(target(T1))).toBe(true);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("100 件の窓がすべて基準値より新しいときは判断できないので取り直す", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve(Array.from({ length: 100 }, () => activity(T1, "refs/heads/other")));
		expect(await detect(target(T1))).toBe(true);
	});

	it("記録の遅延で該当の push がまだ無いときは基準値を進めず次の tick で見つける", async () => {
		const { detect, serve } = setup();
		await detect(target(T0));
		serve([activity(T0, "refs/heads/topic")]);
		expect(await detect(target(T1))).toBe(false);
		serve([activity(T1, "refs/heads/topic")]);
		expect(await detect(target(T1))).toBe(true);
	});

	it("記録が現れないまま上限の tick を超えたら基準値を進めて待つのをやめる", async () => {
		const { detect, serve, fn } = setup();
		await detect(target(T0));
		serve([]);
		for (let i = 0; i < MAX_ACTIVITY_LAG_TICKS; i++)
			expect(await detect(target(T1))).toBe(false);
		await detect(target(T1));
		expect(fn).toHaveBeenCalledTimes(MAX_ACTIVITY_LAG_TICKS);
		serve([activity(T2, "refs/heads/topic")]);
		expect(await detect(target(T2))).toBe(true);
	});

	it("プロジェクトの Git push だけを API キーを URL に載せず 100 件取る", async () => {
		const { detect, serve, fn } = setup();
		await detect(target(T0));
		serve([activity(T1, "refs/heads/topic")]);
		await detect(target(T1));
		const [url, init] = fn.mock.calls[0] ?? [];
		const requested = new URL(String(url));
		expect(requested.pathname).toBe("/api/v2/projects/TEST/activities");
		expect(requested.searchParams.getAll("activityTypeId[]")).toEqual(["12"]);
		expect(requested.searchParams.get("count")).toBe("100");
		expect(requested.search).not.toContain("KEY");
		expect(init).toMatchObject({ headers: { "Backlog-API-Key": "KEY" } });
	});
});
