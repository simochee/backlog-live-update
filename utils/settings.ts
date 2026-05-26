import * as v from "valibot";
import { storage } from "#imports";

export const SpaceConfigSchema = v.object({
	id: v.pipe(
		v.string(),
		v.title("Space ID"),
		v.nonEmpty("Space ID は必須です"),
		v.regex(/^[a-zA-Z0-9-]+$/, "英数字とハイフンのみ使用できます"),
	),
	apiKey: v.pipe(
		v.string(),
		v.title("API Key"),
		v.nonEmpty("API Key は必須です"),
	),
	enabled: v.pipe(v.boolean(), v.title("有効")),
});

export const SettingsSchema = v.object({
	globalEnabled: v.pipe(v.boolean(), v.title("全機能を有効化")),
	intervalMinutes: v.pipe(
		v.number(),
		v.title("更新間隔(分)"),
		v.integer("整数で入力してください"),
		v.minValue(1, "1 以上で入力してください"),
		v.maxValue(30, "30 以下で入力してください"),
	),
	spaces: v.pipe(v.array(SpaceConfigSchema), v.title("スペース")),
});

export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;
export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
	globalEnabled: true,
	intervalMinutes: 1,
	spaces: [],
};

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
	fallback: DEFAULT_SETTINGS,
});
