import type { JsonSchema } from "@valibot/to-json-schema";
import { safeParse } from "valibot";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import {
	DEFAULT_SETTINGS,
	SettingsSchema,
	SpaceConfigSchema,
	settingsJsonSchema,
	settingsStorage,
} from "./settings";

beforeEach(() => {
	fakeBrowser.reset();
});

describe("SettingsSchema", () => {
	it("accepts a valid settings object", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 5,
			spaces: [{ id: "nulab", apiKey: "key", enabled: true }],
		});
		expect(result.success).toBe(true);
	});

	it("rejects intervalMinutes out of range", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 0,
			spaces: [],
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty space id", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 1,
			spaces: [{ id: "", apiKey: "key", enabled: true }],
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty apiKey", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 1,
			spaces: [{ id: "nulab", apiKey: "", enabled: true }],
		});
		expect(result.success).toBe(false);
	});

	it("rejects intervalMinutes above maximum (31)", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 31,
			spaces: [],
		});
		expect(result.success).toBe(false);
	});
});

describe("SpaceConfigSchema", () => {
	it("accepts id with hyphens and digits", () => {
		const result = safeParse(SpaceConfigSchema, {
			id: "nulab-123",
			apiKey: "my-api-key",
			enabled: true,
		});
		expect(result.success).toBe(true);
	});

	it("rejects id containing spaces", () => {
		const result = safeParse(SpaceConfigSchema, {
			id: "nulab space",
			apiKey: "my-api-key",
			enabled: true,
		});
		expect(result.success).toBe(false);
	});
});

describe("settingsJsonSchema", () => {
	const js = settingsJsonSchema as JsonSchema;
	const prop = (name: string): JsonSchema =>
		(js.properties?.[name] ?? {}) as JsonSchema;

	it("is an object schema with title metadata", () => {
		expect(js.type).toBe("object");
		expect(prop("globalEnabled").title).toBe("全機能を有効化");
		expect(prop("intervalMinutes").title).toBe("更新間隔(分)");
		expect(prop("spaces").title).toBe("スペース");
	});

	it("encodes the interval range", () => {
		expect(prop("intervalMinutes").minimum).toBe(1);
		expect(prop("intervalMinutes").maximum).toBe(30);
	});

	it("encodes the space id pattern and titles", () => {
		const spacesSchema = prop("spaces");
		const itemSchema = (spacesSchema.items ?? {}) as JsonSchema;
		const itemProp = (name: string): JsonSchema =>
			(itemSchema.properties?.[name] ?? {}) as JsonSchema;
		expect(itemProp("id").pattern).toBe("^[a-zA-Z0-9-]+$");
		expect(itemProp("id").title).toBe("Space ID");
		expect(itemProp("id").minLength).toBe(1);
		expect(itemProp("apiKey").title).toBe("API Key");
		expect(itemProp("apiKey").minLength).toBe(1);
		expect(itemProp("enabled").title).toBe("有効");
	});

	it("has required fields at top level and space item level", () => {
		expect(js.required).toContain("globalEnabled");
		expect(js.required).toContain("intervalMinutes");
		expect(js.required).toContain("spaces");
		const spacesSchema = prop("spaces");
		const itemSchema = (spacesSchema.items ?? {}) as JsonSchema;
		expect(itemSchema.required).toContain("id");
		expect(itemSchema.required).toContain("apiKey");
		expect(itemSchema.required).toContain("enabled");
	});
});

describe("settingsStorage", () => {
	it("returns DEFAULT_SETTINGS when empty", async () => {
		expect(await settingsStorage.getValue()).toEqual(DEFAULT_SETTINGS);
	});

	it("persists and reads back", async () => {
		await settingsStorage.setValue({
			globalEnabled: false,
			intervalMinutes: 10,
			spaces: [{ id: "nulab", apiKey: "test-key", enabled: false }],
		});
		const stored = await settingsStorage.getValue();
		expect(stored).toEqual({
			globalEnabled: false,
			intervalMinutes: 10,
			spaces: [{ id: "nulab", apiKey: "test-key", enabled: false }],
		});
	});
});
