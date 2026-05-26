import { safeParse } from "valibot";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { DEFAULT_SETTINGS, SettingsSchema, settingsStorage } from "./settings";

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
});

describe("settingsStorage", () => {
	it("returns DEFAULT_SETTINGS when empty", async () => {
		expect(await settingsStorage.getValue()).toEqual(DEFAULT_SETTINGS);
	});

	it("persists and reads back", async () => {
		await settingsStorage.setValue({
			globalEnabled: false,
			intervalMinutes: 10,
			spaces: [],
		});
		const stored = await settingsStorage.getValue();
		expect(stored.globalEnabled).toBe(false);
		expect(stored.intervalMinutes).toBe(10);
	});
});
