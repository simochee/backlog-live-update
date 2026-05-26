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
	it("is an object schema with title metadata", () => {
		const js = settingsJsonSchema as Record<string, any>;
		expect(js.type).toBe("object");
		expect(js.properties.globalEnabled.title).toBe("全機能を有効化");
		expect(js.properties.intervalMinutes.title).toBe("更新間隔(分)");
	});

	it("encodes the interval range", () => {
		const js = settingsJsonSchema as Record<string, any>;
		expect(js.properties.intervalMinutes.minimum).toBe(1);
		expect(js.properties.intervalMinutes.maximum).toBe(30);
	});

	it("encodes the space id pattern and titles", () => {
		const js = settingsJsonSchema as Record<string, any>;
		const item = js.properties.spaces.items.properties;
		expect(item.id.pattern).toBe("^[a-zA-Z0-9-]+$");
		expect(item.id.title).toBe("Space ID");
		expect(item.apiKey.title).toBe("API Key");
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
