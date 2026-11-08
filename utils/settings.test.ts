import { describe, expect, it } from "vite-plus/test";
import {
	DEFAULT_SETTINGS,
	migrateSettingsV1ToV2,
	migrateSettingsV2ToV3,
	parseSettings,
} from "./settings";

describe("parseSettings", () => {
	it("有効な settings をそのまま通す", () => {
		const input = { interval: 30, space: { key: "nulab", apiKey: "key" } };
		expect(parseSettings(input)).toEqual(input);
	});

	it("object でなければ既定値へフォールバックする", () => {
		expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings("oops")).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
	});

	it("interval が不正/欠損なら既定値へフォールバックする", () => {
		const space = { key: "a", apiKey: "k" };
		expect(parseSettings({ interval: 0, space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: -3, space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: 1, space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ interval: "60", space }).interval).toBe(
			DEFAULT_SETTINGS.interval,
		);
		expect(parseSettings({ space }).interval).toBe(DEFAULT_SETTINGS.interval);
	});

	it("space が不正/欠損なら既定 space へフォールバックする", () => {
		expect(parseSettings({ interval: 60, space: "nope" }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
		expect(parseSettings({ interval: 60, space: { key: 123 } }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
		expect(parseSettings({ interval: 60 }).space).toEqual(
			DEFAULT_SETTINGS.space,
		);
	});

	it("許可された interval 値はそのまま保持する", () => {
		for (const v of [15, 30, 60, 300, 600]) {
			expect(
				parseSettings({ interval: v, space: { key: "x", apiKey: "y" } }),
			).toEqual({ interval: v, space: { key: "x", apiKey: "y" } });
		}
	});
});

describe("migrateSettingsV1ToV2", () => {
	it("旧形式の先頭 Space 設定を引き継ぐ", () => {
		expect(
			migrateSettingsV1ToV2({
				interval: 60,
				spaces: [{ id: "a", apiKey: "k" }],
			}),
		).toEqual({ interval: 60, space: { id: "a", apiKey: "k" } });
	});

	it("複数 space は先頭のみ引き継ぐ", () => {
		expect(
			migrateSettingsV1ToV2({
				interval: 30,
				spaces: [
					{ id: "a", apiKey: "k" },
					{ id: "b", apiKey: "k2" },
				],
			}),
		).toEqual({ interval: 30, space: { id: "a", apiKey: "k" } });
	});

	it("spaces が空/欠損なら space:undefined を返す", () => {
		expect(migrateSettingsV1ToV2({ interval: 300, spaces: [] })).toEqual({
			interval: 300,
			space: undefined,
		});
		expect(migrateSettingsV1ToV2({ interval: 300 })).toEqual({
			interval: 300,
			space: undefined,
		});
	});

	it("object でなければ interval/space ともに undefined", () => {
		expect(migrateSettingsV1ToV2(null)).toEqual({
			interval: undefined,
			space: undefined,
		});
	});
});

describe("migrateSettingsV2ToV3", () => {
	it("旧形式の Space ID を Space Key として引き継ぐ", () => {
		expect(
			migrateSettingsV2ToV3({
				interval: 60,
				space: { id: "nulab", apiKey: "k" },
			}),
		).toEqual({ interval: 60, space: { key: "nulab", apiKey: "k" } });
	});

	it("既に key があれば優先する", () => {
		expect(
			migrateSettingsV2ToV3({
				interval: 60,
				space: { id: "old", key: "new", apiKey: "k" },
			}),
		).toEqual({ interval: 60, space: { key: "new", apiKey: "k" } });
	});

	it("不正値は既定値へフォールバックする", () => {
		expect(migrateSettingsV2ToV3(null)).toEqual(DEFAULT_SETTINGS);
		expect(migrateSettingsV2ToV3({ interval: 60, space: "nope" })).toEqual({
			interval: 60,
			space: DEFAULT_SETTINGS.space,
		});
	});

	it("許可外 interval は既定値へフォールバックする", () => {
		expect(
			migrateSettingsV2ToV3({
				interval: 1,
				space: { id: "a", apiKey: "k" },
			}),
		).toEqual({
			interval: DEFAULT_SETTINGS.interval,
			space: { key: "a", apiKey: "k" },
		});
	});
});
