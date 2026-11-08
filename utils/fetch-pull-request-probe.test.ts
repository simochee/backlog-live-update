import { createClient } from "backlog-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { jsonResponse, mockFetch } from "../test/fetch-mock";
import { fetchPullRequestProbe } from "./fetch-pull-request-probe";
import { fetchWithoutCache } from "./fetch-without-cache";

afterEach(() => {
	vi.unstubAllGlobals();
});

const ref = { projectKey: "TEST", repoName: "my repo", number: 3 };
const client = () =>
	createClient({
		host: "example.backlog.com",
		apiKey: "KEY",
		fetch: fetchWithoutCache,
	});

describe("PR の public API の取得", () => {
	it("直近 100 件のコメントを新しい順に API キーを URL に載せず取得する", async () => {
		const fn = mockFetch(() => jsonResponse([]));
		await fetchPullRequestProbe(client(), ref);
		expect(fn).toHaveBeenCalledOnce();
		const [url, init] = fn.mock.calls[0] ?? [];
		expect(String(url)).toBe(
			"https://example.backlog.com/api/v2/projects/TEST/git/repositories/my%20repo/pullRequests/3/comments?count=100&order=desc",
		);
		expect(init).toMatchObject({
			cache: "no-store",
			headers: { "Backlog-API-Key": "KEY" },
		});
	});
	it("コメントの id と作成日時と更新日時だけを返す", async () => {
		mockFetch(() =>
			jsonResponse([
				{
					id: 2,
					created: "2026-11-08T09:44:09Z",
					updated: "2026-11-08T09:50:00Z",
					content: "x",
				},
				{
					id: 1,
					created: "2026-11-08T09:44:08Z",
					updated: "2026-11-08T09:44:08Z",
					content: "y",
				},
			]),
		);
		expect(await fetchPullRequestProbe(client(), ref)).toEqual({
			comments: [
				{
					id: 2,
					created: "2026-11-08T09:44:09Z",
					updated: "2026-11-08T09:50:00Z",
				},
				{
					id: 1,
					created: "2026-11-08T09:44:08Z",
					updated: "2026-11-08T09:44:08Z",
				},
			],
			complete: true,
		});
	});
	it("100 件に達したら窓より古いコメントがあり得ると伝える", async () => {
		const stamp = "2026-11-08T09:44:08Z";
		mockFetch(() =>
			jsonResponse(
				Array.from({ length: 100 }, (_, i) => ({
					id: 100 - i,
					created: stamp,
					updated: stamp,
				})),
			),
		);
		expect((await fetchPullRequestProbe(client(), ref))?.complete).toBe(false);
	});
	it("取得に失敗したら null を返す", async () => {
		mockFetch(() => jsonResponse({}, false));
		expect(await fetchPullRequestProbe(client(), ref)).toBeNull();
	});
});
