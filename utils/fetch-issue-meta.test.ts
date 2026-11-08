import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { jsonResponse, mockFetch } from "../test/fetch-mock";
import { fetchIssueMeta } from "./fetch-issue-meta";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchIssueMeta", () => {
	it("最新の課題情報を取得し、API キーは URL に含めずヘッダで認証する", async () => {
		const fn = mockFetch(() =>
			jsonResponse({ id: 42, updated: "2026-05-27T04:53:21Z" }),
		);

		await fetchIssueMeta("example.backlog.com", "KEY", "PROJ-1");

		const call = fn.mock.calls.at(0);
		expect(call).toBeDefined();
		const url = String(call?.[0]);
		expect(url).toBe("https://example.backlog.com/api/v2/issues/PROJ-1");
		expect(url).not.toContain("apiKey=");
		expect(url).not.toContain("KEY");
		expect(call?.[1]).toMatchObject({
			cache: "no-store",
			headers: { "Backlog-API-Key": "KEY" },
		});
	});

	it("id と updated を返す", async () => {
		mockFetch(() => jsonResponse({ id: 42, updated: "2026-05-27T04:53:21Z" }));

		expect(await fetchIssueMeta("h", "K", "PROJ-1")).toEqual({
			id: 42,
			updated: "2026-05-27T04:53:21Z",
		});
	});

	it("res.ok が false なら null", async () => {
		mockFetch(() => jsonResponse({ id: 42, updated: "x" }, false));
		expect(await fetchIssueMeta("h", "K", "PROJ-1")).toBeNull();
	});

	it("fetch が throw したら null", async () => {
		mockFetch(() => {
			throw new Error("network");
		});
		expect(await fetchIssueMeta("h", "K", "PROJ-1")).toBeNull();
	});

	it.each([
		["object でない", "not-json"],
		["id が number でない", { id: "42", updated: "x" }],
		["updated が string でない", { id: 42, updated: 0 }],
	])("%s なら null", async (_label, body) => {
		mockFetch(() => jsonResponse(body));
		expect(await fetchIssueMeta("h", "K", "PROJ-1")).toBeNull();
	});
});
