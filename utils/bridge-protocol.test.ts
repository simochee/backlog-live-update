import { describe, expect, it } from "vitest";
import { parseIssueRef, parseStateResponse } from "./bridge-protocol";

describe("parseStateResponse", () => {
	it("found:true の payload を読む", () => {
		const detail = JSON.stringify({ found: true, issueId: 42, minId: 7 });
		expect(parseStateResponse(detail)).toEqual({
			found: true,
			issueId: 42,
			minId: 7,
		});
	});

	it("found:false の payload を読む", () => {
		expect(parseStateResponse(JSON.stringify({ found: false }))).toEqual({
			found: false,
		});
	});

	it.each([
		["非 string", 123],
		["壊れた JSON", "{not json"],
		["object でない JSON", JSON.stringify("oops")],
		["found 欠損", JSON.stringify({ issueId: 1 })],
	])("%s は found:false へフォールバック", (_label, detail) => {
		expect(parseStateResponse(detail)).toEqual({ found: false });
	});
});

describe("parseIssueRef", () => {
	it("issueKey / issueId を読む", () => {
		const detail = JSON.stringify({ issueKey: "PROJ-1", issueId: 42 });
		expect(parseIssueRef(detail)).toEqual({ issueKey: "PROJ-1", issueId: 42 });
	});

	it.each([
		["非 string", 123],
		["壊れた JSON", "{bad"],
		["issueKey 欠損", JSON.stringify({ issueId: 42 })],
		["issueId 非 number", JSON.stringify({ issueKey: "P-1", issueId: "42" })],
		["object でない JSON", JSON.stringify(5)],
	])("%s は null", (_label, detail) => {
		expect(parseIssueRef(detail)).toBeNull();
	});
});
