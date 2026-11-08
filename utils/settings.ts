import * as v from "valibot";
import { storage } from "#imports";
import { BACKLOG_HOST_MATCHES } from "./backlog";

export const SpaceConfigSchema = v.object({
	key: v.string(),
	apiKey: v.string(),
	enabled: v.optional(v.boolean(), true),
});

export const INTERVAL_OPTIONS = [15, 30, 60, 300, 600] as const;

export const IntervalSchema = v.picklist(INTERVAL_OPTIONS);

export const SettingsSchema = v.object({
	interval: IntervalSchema,
	spaces: v.array(SpaceConfigSchema),
});

export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;
export type Settings = v.InferOutput<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
	interval: 60,
	spaces: [],
};

export function parseSettings(raw: unknown): Settings {
	const source = (typeof raw === "object" && raw !== null ? raw : {}) as {
		interval?: unknown;
		spaces?: unknown;
	};
	return {
		interval: v.parse(
			v.fallback(IntervalSchema, DEFAULT_SETTINGS.interval),
			source.interval,
		),
		spaces: Array.isArray(source.spaces)
			? source.spaces.flatMap((entry) => {
					const parsed = v.safeParse(SpaceConfigSchema, entry);
					return parsed.success ? [parsed.output] : [];
				})
			: [],
	};
}

export function findSpaceForHost(
	settings: Settings,
	hostname: string,
): SpaceConfig | undefined {
	return settings.spaces.find(
		(space) => space.enabled && space.key === hostname.split(".")[0],
	);
}

export function effectiveConfigForHost(settings: Settings, hostname: string) {
	const space = findSpaceForHost(settings, hostname);
	return space
		? { interval: settings.interval, apiKey: space.apiKey }
		: undefined;
}

export function parseSpaceKeyInput(input: string): string | undefined {
	const value = input.trim();
	if (/^[a-zA-Z0-9-]+$/.test(value)) return value;
	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		if (
			!["https:", "http:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.port
		)
			return undefined;
		const domains = BACKLOG_HOST_MATCHES.map((match) =>
			match.replace("*://*.", "").replace("/*", ""),
		);
		const labels = url.hostname.split(".");
		if (labels.length !== 3 || !domains.includes(labels.slice(1).join(".")))
			return undefined;
		const key = value.replace(/^https?:\/\//i, "").split(/[./:?#]/)[0];
		return /^[a-zA-Z0-9-]+$/.test(key ?? "") ? key : undefined;
	} catch {
		return undefined;
	}
}

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

export function migrateSettingsV2ToV3(old: unknown) {
	const v2 = (typeof old === "object" && old !== null ? old : {}) as {
		interval?: unknown;
		space?: unknown;
	};
	const space = (
		typeof v2.space === "object" && v2.space !== null ? v2.space : {}
	) as { id?: unknown; key?: unknown; apiKey?: unknown };
	return v.parse(
		v.object({
			interval: v.fallback(IntervalSchema, 60),
			space: v.fallback(v.object({ key: v.string(), apiKey: v.string() }), {
				key: "",
				apiKey: "",
			}),
		}),
		{
			interval: v2.interval,
			space: {
				key: space.key ?? space.id,
				apiKey: space.apiKey,
			},
		},
	);
}

export function migrateSettingsV3ToV4(old: unknown): Settings {
	const v3 = migrateSettingsV2ToV3(old);
	return parseSettings({
		interval: v3.interval,
		spaces: v3.space.key ? [{ ...v3.space, enabled: true }] : [],
	});
}

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
	fallback: DEFAULT_SETTINGS,
	version: 4,
	migrations: {
		2: migrateSettingsV1ToV2,
		3: migrateSettingsV2ToV3,
		4: migrateSettingsV3ToV4,
	},
});
