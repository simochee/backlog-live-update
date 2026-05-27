import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	migrateSettingsV1ToV2,
	parseSettings,
} from "./settings";

describe("parseSettings", () => {
	it("有効な settings をそのまま通す", () => {
		const input = { interval: 5, space: { id: "nulab", apiKey: "key" } };
		expect(parseSettings(input)).toEqual(input);
	});

	it("object でなければ既定値へフォールバックする", () => {
		expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings("oops")).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
	});

	it("interval が不正/欠損なら既定値へフォールバックする", () => {
		const space = { id: "a", apiKey: "k" };
		expect(parseSettings({ interval: 0, space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: -3, space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: "5", space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ space }).interval).toBe(DEFAULT_SETTINGS.interval);
	});

	it("space が不正/欠損なら既定 space へフォールバックする", () => {
		expect(parseSettings({ interval: 1, space: "nope" }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
		expect(parseSettings({ interval: 1, space: { id: 123 } }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
		expect(parseSettings({ interval: 1 }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
	});

	it("有効な値はそのまま保持する", () => {
		expect(
			parseSettings({ interval: 30, space: { id: "x", apiKey: "y" } }),
		).toEqual({ interval: 30, space: { id: "x", apiKey: "y" } });
	});
});

describe("migrateSettingsV1ToV2", () => {
	it("spaces[0] を space へ移す", () => {
		expect(
			migrateSettingsV1ToV2({
				interval: 5,
				spaces: [{ id: "a", apiKey: "k" }],
			}),
		).toEqual({ interval: 5, space: { id: "a", apiKey: "k" } });
	});

	it("複数 space は先頭のみ引き継ぐ", () => {
		expect(
			migrateSettingsV1ToV2({
				interval: 2,
				spaces: [
					{ id: "a", apiKey: "k" },
					{ id: "b", apiKey: "k2" },
				],
			}),
		).toEqual({ interval: 2, space: { id: "a", apiKey: "k" } });
	});

	it("spaces が空/欠損なら既定 space を使う", () => {
		expect(migrateSettingsV1ToV2({ interval: 3, spaces: [] })).toEqual({
			interval: 3,
			space: DEFAULT_SETTINGS.space,
		});
		expect(migrateSettingsV1ToV2({ interval: 3 })).toEqual({
			interval: 3,
			space: DEFAULT_SETTINGS.space,
		});
	});

	it("object でなければ全体を既定値へ寄せる", () => {
		expect(migrateSettingsV1ToV2(null)).toEqual(DEFAULT_SETTINGS);
	});
});
