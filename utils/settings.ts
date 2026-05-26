import * as v from "valibot";
import { storage } from "#imports";

export const SpaceConfigSchema = v.object({
	id: v.string(),
	apiKey: v.string(),
});

export const SettingsSchema = v.object({
	interval: v.pipe(v.number(), v.minValue(1)),
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
