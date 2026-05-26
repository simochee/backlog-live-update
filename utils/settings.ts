import * as v from "valibot";
import { storage } from "#imports";

export const SpaceConfigSchema = v.object({
	id: v.string(),
	apiKey: v.string(),
});

export const IntervalSchema = v.pipe(v.number(), v.minValue(1));

export const SettingsSchema = v.object({
	interval: IntervalSchema,
	spaces: v.array(SpaceConfigSchema),
});

export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;
export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
	interval: 1,
	spaces: [],
};

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
	fallback: DEFAULT_SETTINGS,
});

/**
 * 寛容版スキーマ: 不正なフィールドは例外を投げずに初期値へフォールバックする。
 * - object 以外 → DEFAULT_SETTINGS 全体
 * - interval が不正/欠損 → 既定値
 * - spaces が非配列/欠損 → []
 * - spaces 内の不正な要素 → その要素だけ除外し、正常な要素は維持
 */
const ParsedSettingsSchema = v.fallback(
	v.object({
		interval: v.fallback(IntervalSchema, DEFAULT_SETTINGS.interval),
		spaces: v.fallback(
			v.pipe(
				v.array(v.unknown()),
				v.transform((items) =>
					items.filter((item): item is SpaceConfig =>
						v.is(SpaceConfigSchema, item),
					),
				),
			),
			DEFAULT_SETTINGS.spaces,
		),
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
