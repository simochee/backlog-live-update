import * as v from "valibot";
import { storage } from "#imports";

export const SpaceConfigSchema = v.object({
	key: v.string(),
	apiKey: v.string(),
});

export const INTERVAL_OPTIONS = [15, 30, 60, 300, 600] as const;

export const IntervalSchema = v.picklist(INTERVAL_OPTIONS);

export const SettingsSchema = v.object({
	interval: IntervalSchema,
	space: SpaceConfigSchema,
});

export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;
export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
	interval: 60,
	space: { key: "", apiKey: "" },
};

/**
 * 寛容版スキーマ: 不正なフィールドは例外を投げずに初期値へフォールバックする。
 * - object 以外 → DEFAULT_SETTINGS 全体
 * - interval が不正/欠損 → 既定値
 * - space が不正/欠損 → 既定 space
 */
const ParsedSettingsSchema = v.fallback(
	v.object({
		interval: v.fallback(IntervalSchema, DEFAULT_SETTINGS.interval),
		space: v.fallback(SpaceConfigSchema, DEFAULT_SETTINGS.space),
	}),
	DEFAULT_SETTINGS,
);

/**
 * ストレージから読み出した値をスキーマ検証し、安全に Settings へ変換する。
 * 問題のあるフィールドは初期値へフォールバックする。
 */
export function parseSettings(raw: unknown): Settings {
	return v.parse(ParsedSettingsSchema, raw);
}

/**
 * v1 settings(`{ interval, spaces: SpaceConfig[] }`)を v2(`{ interval, space }`)へ
 * 移行する。複数 space は廃止し先頭のみ引き継ぐ。正規化は parseSettings に委ねる。
 */
export function migrateSettingsV1ToV2(old: unknown): unknown {
	const v1 = (typeof old === "object" && old !== null ? old : {}) as {
		interval?: unknown;
		spaces?: unknown;
	};
	return {
		interval: v1.interval,
		space: Array.isArray(v1.spaces) ? v1.spaces[0] : undefined,
	};
}

/**
 * v2 settings(`space.id`)を v3(`space.key`)へ rename する。Backlog 公式用語に揃える。
 */
export function migrateSettingsV2ToV3(old: unknown): Settings {
	const v2 = (typeof old === "object" && old !== null ? old : {}) as {
		interval?: unknown;
		space?: unknown;
	};
	const space = (
		typeof v2.space === "object" && v2.space !== null ? v2.space : {}
	) as { id?: unknown; key?: unknown; apiKey?: unknown };
	return parseSettings({
		interval: v2.interval,
		space: {
			key: space.key ?? space.id,
			apiKey: space.apiKey,
		},
	});
}

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
	fallback: DEFAULT_SETTINGS,
	version: 3,
	migrations: {
		2: migrateSettingsV1ToV2,
		3: migrateSettingsV2ToV3,
	},
});
