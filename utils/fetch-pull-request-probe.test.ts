import { createClient } from "backlog-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { jsonResponse } from "../test/fetch-mock";
import { fetchPullRequestProbe } from "./fetch-pull-request-probe";
import { fetchWithoutCache } from "./fetch-without-cache";

afterEach(() => {
	vi.unstubAllGlobals();
});

const ref = { projectKey: "TEST", repoName: "repo", number: 3 };
const PR_PATH = "/api/v2/projects/TEST/git/repositories/repo/pullRequests/3";
const REPO_PATH = "/api/v2/projects/TEST/git/repositories/repo";
function serve(
	comments: unknown[],
	pullRequest: unknown = { updated: "2026-11-08T09:44:08Z", stars: [] },
	repository: unknown = { pushedAt: "2026-11-08T09:00:00Z" },
) {
	const fn = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
		const { pathname } = new URL(String(input));
		const body = {
			[`${PR_PATH}/comments`]: comments,
			[PR_PATH]: pullRequest,
			[REPO_PATH]: repository,
		}[pathname];
		return Promise.resolve(jsonResponse(body));
	});
	vi.stubGlobal("fetch", fn);
	return fn;
}
const client = () =>
	createClient({
		host: "example.backlog.com",
		apiKey: "KEY",
		fetch: fetchWithoutCache,
	});

const STAMP = "2026-11-08T09:44:08Z";
const publicStar = (id: number) => ({
	id,
	comment: null,
	url: "https://example.backlog.com/git/TEST/repo/pullRequests/3",
	title: "t",
	presenter: { id: 7, name: "Alice", mailAddress: "a@example.com" },
	created: STAMP,
});

describe("PR の public API の取得", () => {
	it("PR 本体とコメントとリポジトリの 3 件だけを API キーを URL に載せず取得する", async () => {
		const fn = serve([]);
		await fetchPullRequestProbe(client(), ref);
		const requests = fn.mock.calls.map(([url]) => String(url)).sort();
		expect(requests).toEqual([
			`https://example.backlog.com${REPO_PATH}`,
			`https://example.backlog.com${PR_PATH}`,
			`https://example.backlog.com${PR_PATH}/comments?count=100&order=desc`,
		]);
		for (const [, init] of fn.mock.calls)
			expect(init).toMatchObject({
				cache: "no-store",
				headers: { "Backlog-API-Key": "KEY" },
			});
	});
	it("ページへ渡す分のコメントとスターだけを返す", async () => {
		serve(
			[
				{
					id: 2,
					created: "2026-11-08T09:44:09Z",
					updated: "2026-11-08T09:50:00Z",
					content: "x",
					stars: [publicStar(10)],
				},
				{ id: 1, created: STAMP, updated: STAMP, content: "y", stars: [] },
			],
			{
				stars: [publicStar(20)],
				summary: "s",
				updated: "2026-11-08T09:51:00Z",
			},
			{ pushedAt: "2026-11-08T09:30:00Z", name: "repo" },
		);
		const star = (id: number) => ({
			id,
			url: "https://example.backlog.com/git/TEST/repo/pullRequests/3",
			userId: 7,
			userName: "Alice",
			comment: null,
		});
		expect(await fetchPullRequestProbe(client(), ref)).toEqual({
			comments: [
				{
					id: 2,
					created: "2026-11-08T09:44:09Z",
					updated: "2026-11-08T09:50:00Z",
					stars: [star(10)],
				},
				{ id: 1, created: STAMP, updated: STAMP, stars: [] },
			],
			pullRequest: { updated: "2026-11-08T09:51:00Z", stars: [star(20)] },
			pushedAt: "2026-11-08T09:30:00Z",
			complete: true,
		});
	});
	it("presenter の無いスターは捨てる", async () => {
		serve([], {
			updated: STAMP,
			stars: [{ ...publicStar(1), presenter: null }],
		});
		expect(
			(await fetchPullRequestProbe(client(), ref))?.pullRequest.stars,
		).toEqual([]);
	});
	it("100 件に達したら窓より古いコメントがあり得ると伝える", async () => {
		serve(
			Array.from({ length: 100 }, (_, i) => ({
				id: 100 - i,
				created: STAMP,
				updated: STAMP,
				stars: [],
			})),
		);
		expect((await fetchPullRequestProbe(client(), ref))?.complete).toBe(false);
	});
	it("push 日時を返さないリポジトリは null として扱う", async () => {
		serve([], undefined, {});
		expect((await fetchPullRequestProbe(client(), ref))?.pushedAt).toBeNull();
	});
	it("どれかの取得に失敗したら null を返す", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(
					String(input).includes("/comments") || String(input).endsWith("/repo")
						? jsonResponse([])
						: jsonResponse({}, false),
				),
			),
		);
		expect(await fetchPullRequestProbe(client(), ref)).toBeNull();
	});
});
