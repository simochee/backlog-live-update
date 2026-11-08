import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../test/fetch-mock";
import { fetchInternalComments } from "./fetch-internal-comments";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchInternalComments", () => {
	it("issueId と limit を含む GetInitialComments.action を叩く", async () => {
		const fn = mockFetch(() => jsonResponse({ comments: [] }));

		await fetchInternalComments(42, 50);

		const url = String(fn.mock.calls[0][0]);
		expect(url).toContain("/GetInitialComments.action?");
		expect(url).toContain("issueId=42");
		expect(url).toContain("limit=50");
		expect(url).toContain("includeOrigin=true");
	});

	it("レスポンスの comments 配列を返す", async () => {
		mockFetch(() => jsonResponse({ comments: [{ id: 1 }, { id: 2 }] }));

		const comments = await fetchInternalComments(42);

		expect(comments).toEqual([{ id: 1 }, { id: 2 }]);
	});

	it("res.ok が false なら null", async () => {
		mockFetch(() => jsonResponse({ comments: [] }, false));
		expect(await fetchInternalComments(42)).toBeNull();
	});

	it("fetch が throw したら null", async () => {
		mockFetch(() => {
			throw new Error("network");
		});
		expect(await fetchInternalComments(42)).toBeNull();
	});

	it("comments が配列でなければ null", async () => {
		mockFetch(() => jsonResponse({ comments: "nope" }));
		expect(await fetchInternalComments(42)).toBeNull();
	});

	it("レスポンスが object でなければ null", async () => {
		mockFetch(() => jsonResponse("not-json"));
		expect(await fetchInternalComments(42)).toBeNull();
	});
});

it.each([
	null,
	{},
	{ id: "1" },
	{ id: false },
	1,
])("id が数値でない comment %j を含む応答は全体を null にする", async (invalid) => {
	mockFetch(() => jsonResponse({ comments: [{ id: 1 }, invalid, { id: 2 }] }));
	expect(await fetchInternalComments(42)).toBeNull();
});

it("comment の id 以外の不透明な field を保持する", async () => {
	const comments = [
		{
			id: 1,
			content: "<p>hello</p>",
			notifyResource: [{ notificationId: 2 }],
			nested: { value: null },
		},
	];
	mockFetch(() => jsonResponse({ comments }));
	expect(await fetchInternalComments(42)).toStrictEqual(comments);
});
