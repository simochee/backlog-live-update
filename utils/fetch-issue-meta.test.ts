import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIssueMeta } from "./fetch-issue-meta";

const mockFetch = (impl: () => Response | Promise<Response>) => {
	const fn = vi.fn<
		(
			input: string | URL | Request,
			init?: RequestInit,
		) => Response | Promise<Response>
	>(() => impl());
	vi.stubGlobal("fetch", fn);
	return fn;
};

const jsonResponse = (body: unknown, ok = true) =>
	({ ok, json: async () => body }) as unknown as Response;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchIssueMeta", () => {
	it("public REST API を no-store + cache-bust で叩く", async () => {
		const fn = mockFetch(() =>
			jsonResponse({ id: 42, updated: "2026-05-27T04:53:21Z" }),
		);

		await fetchIssueMeta("example.backlog.com", "KEY", "PROJ-1");

		const url = String(fn.mock.calls[0][0]);
		expect(url).toContain("https://example.backlog.com/api/v2/issues/PROJ-1?");
		expect(url).toContain("apiKey=KEY");
		expect(url).toContain("_=");
		expect(fn.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
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
