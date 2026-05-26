import * as v from "valibot";
import { storage } from "#imports";

export const SpaceConfigSchema = v.object({
	id: v.pipe(
		v.string(),
		v.nonEmpty("Space ID は必須です"),
		v.regex(/^[a-z0-9-]+$/i, "英数字とハイフンのみ使用できます"),
	),
	apiKey: v.pipe(v.string(), v.nonEmpty("API Key は必須です")),
	enabled: v.boolean(),
});

export const SettingsSchema = v.object({
	globalEnabled: v.boolean(),
	intervalMinutes: v.pipe(
		v.number(),
		v.integer("整数で入力してください"),
		v.minValue(1, "1 以上で入力してください"),
		v.maxValue(30, "30 以下で入力してください"),
	),
	spaces: v.array(SpaceConfigSchema),
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
