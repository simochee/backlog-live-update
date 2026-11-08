import { describe, expect, it, vi } from "vite-plus/test";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
	DEFAULT_SETTINGS,
	effectiveConfigForHost,
	findSpaceForHost,
	INTERVAL_OPTIONS,
	migrateSettingsV1ToV2,
	migrateSettingsV2ToV3,
	migrateSettingsV3ToV4,
	parseSettings,
	parseSpaceKeyInput,
} from "./settings";

const space = { key: "nulab", apiKey: "key", enabled: true };

describe("parseSettings", () => {
	it("有効な設定と許可された間隔を保持する", () => {
		for (const interval of INTERVAL_OPTIONS) {
			const settings = { interval, spaces: [space] };
			expect(parseSettings(settings)).toEqual(settings);
		}
	});
	it("不正な設定と間隔を既定値へ戻す", () => {
		for (const raw of [null, undefined, "oops", 42])
			expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
		for (const interval of [undefined, 0, -3, 1, "60"])
			expect(parseSettings({ interval, spaces: [space] })).toEqual({
				...DEFAULT_SETTINGS,
				spaces: [space],
			});
	});
	it("spaces が配列でなければ空配列にする", () => {
		for (const spaces of [undefined, null, {}, "nope"])
			expect(parseSettings({ spaces }).spaces).toEqual([]);
	});
	it("不正な要素だけを除外し enabled の欠損は true にする", () => {
		expect(
			parseSettings({
				spaces: [
					space,
					null,
					{ key: 123, apiKey: "k" },
					{ key: "missing" },
					{ key: "a", apiKey: "k", enabled: "yes" },
					{ key: "b", apiKey: "", enabled: false },
					{ key: "c", apiKey: "k" },
				],
			}).spaces,
		).toEqual([
			space,
			{ key: "b", apiKey: "", enabled: false },
			{ key: "c", apiKey: "k", enabled: true },
		]);
	});
	it("小文字へ正規化したキーが重複する場合は無効状態でも先頭だけを保つ", () => {
		expect(
			parseSettings({
				spaces: [
					{ ...space, key: "NuLab", enabled: false },
					{ ...space, apiKey: "second" },
					{ key: "other", apiKey: "k", enabled: true },
				],
			}).spaces,
		).toEqual([
			{ ...space, enabled: false },
			{ key: "other", apiKey: "k", enabled: true },
		]);
	});
});

describe("v4 への移行", () => {
	it("v3 の単一スペースを有効な配列要素にする", () => {
		expect(
			migrateSettingsV3ToV4({
				interval: 30,
				space: { key: "nulab", apiKey: "key" },
			}),
		).toEqual({ interval: 30, spaces: [space] });
	});
	it("空の既定スペースを引き継がない", () => {
		expect(
			migrateSettingsV3ToV4({ interval: 60, space: { key: "", apiKey: "" } }),
		).toEqual(DEFAULT_SETTINGS);
	});
	it("v1 からの移行を連鎖してすべてのスペースを保つ", () => {
		expect(
			migrateSettingsV3ToV4(
				migrateSettingsV2ToV3(
					migrateSettingsV1ToV2({
						interval: 30,
						spaces: [
							{ id: "nulab", apiKey: "key" },
							{ id: "other", apiKey: "k" },
						],
					}),
				),
			),
		).toEqual({
			interval: 30,
			spaces: [space, { key: "other", apiKey: "k", enabled: true }],
		});
	});
	it("v4 形式を再移行しても有効状態と複数スペースを保つ", () => {
		const current = {
			interval: 30,
			spaces: [space, { key: "other", apiKey: "k", enabled: false }],
		};
		expect(migrateSettingsV3ToV4(current)).toEqual(current);
	});
	it("旧 UI のホスト名と URL をキーへ直し解析できないスペースだけを除外する", () => {
		expect(
			migrateSettingsV3ToV4(
				migrateSettingsV2ToV3(
					migrateSettingsV1ToV2({
						interval: 30,
						spaces: [
							{ id: "NuLab.backlog.jp", apiKey: "key" },
							{ id: "https://Other.backlogtool.com/view/P-1", apiKey: "k" },
							{ id: "https://evil.com", apiKey: "bad" },
							{ id: "a-", apiKey: "bad" },
							{ id: "missing-api-key" },
							{ id: "valid", apiKey: "" },
						],
					}),
				),
			),
		).toEqual({
			interval: 30,
			spaces: [
				space,
				{ key: "other", apiKey: "k", enabled: true },
				{ key: "valid", apiKey: "", enabled: true },
			],
		});
	});
	it.each([
		{
			name: "v1",
			version: 1,
			settings: {
				interval: 30,
				spaces: [
					{ id: "nulab", apiKey: "key" },
					{ id: "other", apiKey: "k" },
				],
			},
			spaces: [space, { key: "other", apiKey: "k", enabled: true }],
		},
		{
			name: "メタデータのない v1",
			version: undefined,
			settings: {
				interval: 30,
				spaces: [
					{ id: "nulab.backlog.jp", apiKey: "key" },
					{ id: "other", apiKey: "k" },
				],
			},
			spaces: [space, { key: "other", apiKey: "k", enabled: true }],
		},
		{
			name: "v2",
			version: 2,
			settings: {
				interval: 30,
				space: { id: "https://NuLab.backlog.jp/view/P-1", apiKey: "key" },
			},
			spaces: [space],
		},
		{
			name: "v3",
			version: 3,
			settings: {
				interval: 30,
				space: { key: "NuLab.backlog.jp", apiKey: "key" },
			},
			spaces: [space],
		},
		{
			name: "v3 メタデータと v4 の値",
			version: 3,
			settings: {
				interval: 30,
				spaces: [space, { key: "other", apiKey: "k", enabled: false }],
			},
			spaces: [space, { key: "other", apiKey: "k", enabled: false }],
		},
	])("storage から $name を読み込むと v4 に移行する", async ({
		version,
		settings,
		spaces,
	}) => {
		fakeBrowser.reset();
		await fakeBrowser.storage.local.set({
			settings,
			...(version === undefined ? {} : { settings$: { v: version } }),
		});
		vi.resetModules();
		const { settingsStorage } = await import("./settings");
		expect(await settingsStorage.getValue()).toEqual({ interval: 30, spaces });
		expect(
			(await fakeBrowser.storage.local.get("settings$")).settings$,
		).toEqual({ v: 4 });
	});
});

describe("ホストに対応する設定", () => {
	const settings = {
		interval: 30 as const,
		spaces: [
			{ ...space, enabled: false },
			{ ...space, apiKey: "second" },
			{ key: "other", apiKey: "other", enabled: true },
		],
	};
	it("ドメインに依存せず最初の有効なキー一致を返す", () => {
		for (const domain of ["backlog.com", "backlog.jp", "backlogtool.com"])
			expect(findSpaceForHost(settings, `nulab.${domain}`)?.apiKey).toBe(
				"second",
			);
		expect(findSpaceForHost(settings, "missing.backlog.com")).toBeUndefined();
	});
	it("大文字を含む保存済みキーも読み込み時に小文字へそろいホスト名と一致する", () => {
		const parsed = parseSettings({ spaces: [{ ...space, key: "NuLab" }] });
		expect(parsed.spaces[0]?.key).toBe("nulab");
		expect(findSpaceForHost(parsed, "NuLab.backlog.jp")?.apiKey).toBe(
			space.apiKey,
		);
	});
	it("無効なスペースには実効設定を返さない", () => {
		expect(
			effectiveConfigForHost(
				{ interval: 60, spaces: [{ ...space, enabled: false }] },
				"nulab.backlog.jp",
			),
		).toBeUndefined();
		expect(effectiveConfigForHost(settings, "nulab.backlog.jp")).toEqual({
			interval: 30,
			apiKey: "second",
		});
	});
});

describe("parseSpaceKeyInput", () => {
	it("キーと Backlog のホストと URL を受け付ける", () => {
		for (const input of [
			" nulab ",
			"nulab.backlog.jp",
			"https://nulab.backlog.com/view/ABC-1",
			"https://nulab.backlogtool.com/view/ABC-1",
		])
			expect(parseSpaceKeyInput(input)).toBe("nulab");
	});
	it("ホスト名と同じく大文字小文字を区別せず小文字のキーにそろえる", () => {
		expect(parseSpaceKeyInput("Team-1")).toBe("team-1");
		expect(parseSpaceKeyInput("https://Team-1.backlog.jp/view/ABC-1")).toBe(
			"team-1",
		);
	});
	it("外部 URL と不正な入力を受け付けない", () => {
		for (const input of [
			"",
			"a b",
			"-",
			"---",
			"-a",
			"a-",
			"-a.backlog.jp",
			"https://a-.backlog.com",
			"https://evil.com",
			"nulab.backlog.jp.evil.com",
			"https://backlog.com",
			"https://a.b.backlog.com",
			"ftp://nulab.backlog.com",
			"https://evil@nulab.backlog.jp",
			"https://nulab.backlog.jp:444",
		])
			expect(parseSpaceKeyInput(input)).toBeUndefined();
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

	it("追加スペースも移行の中間形式で保つ", () => {
		expect(
			migrateSettingsV1ToV2({
				interval: 30,
				spaces: [
					{ id: "a", apiKey: "k" },
					{ id: "b", apiKey: "k2" },
				],
			}),
		).toEqual({
			interval: 30,
			space: { id: "a", apiKey: "k" },
			additionalSpaces: [{ id: "b", apiKey: "k2" }],
		});
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
		expect(migrateSettingsV2ToV3(null)).toEqual({
			interval: 60,
			space: { key: "", apiKey: "" },
		});
		expect(migrateSettingsV2ToV3({ interval: 60, space: "nope" })).toEqual({
			interval: 60,
			space: { key: "", apiKey: "" },
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
