import { createClient, getIssueComments } from "backlog-js";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { jsonResponse, mockFetch } from "../test/fetch-mock";
import { fetchWithoutCache } from "./fetch-without-cache";

afterEach(() => vi.unstubAllGlobals());

it("コメントの変更をキャッシュで見落とさず、API キーをヘッダだけで送る", async () => {
	const fetch = mockFetch(() => jsonResponse([]));
	const client = createClient({
		host: "example.backlog.com",
		apiKey: "SECRET",
		fetch: fetchWithoutCache,
	});
	await getIssueComments(client, 42, { minId: 0, count: 20, order: "asc" });
	const [url, init] = fetch.mock.calls[0] ?? [];
	expect(String(url)).not.toContain("SECRET");
	expect(String(url)).not.toContain("apiKey");
	expect(init).toMatchObject({
		cache: "no-store",
		headers: { "Backlog-API-Key": "SECRET" },
	});
});
