import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
	it("passes through a valid settings object", () => {
		const input = {
			interval: 5,
			spaces: [{ id: "nulab", apiKey: "key" }],
		};
		expect(parseSettings(input)).toEqual(input);
	});

	it("falls back to defaults when the value is not an object", () => {
		expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings("oops")).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
	});

	it("falls back interval to the default when invalid or missing", () => {
		expect(parseSettings({ interval: 0, spaces: [] }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: -3, spaces: [] }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: "5", spaces: [] }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ spaces: [] }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
	});

	it("falls back spaces to an empty array when not an array", () => {
		expect(parseSettings({ interval: 1, spaces: "nope" }).spaces).toEqual([]);
		expect(parseSettings({ interval: 1 }).spaces).toEqual([]);
	});

	it("drops invalid space entries while keeping valid ones", () => {
		const result = parseSettings({
			interval: 1,
			spaces: [
				{ id: "valid", apiKey: "key" },
				{ id: "missing-key" },
				{ apiKey: "missing-id" },
				{ id: 123, apiKey: "not-a-string-id" },
				"not-an-object",
				{ id: "another", apiKey: "key2" },
			],
		});
		expect(result.spaces).toEqual([
			{ id: "valid", apiKey: "key" },
			{ id: "another", apiKey: "key2" },
		]);
	});

	it("keeps a valid interval untouched", () => {
		expect(parseSettings({ interval: 30, spaces: [] }).interval).toBe(30);
	});
});
