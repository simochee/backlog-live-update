import { parseSpaceKeyInput } from "./settings";

export type SpaceUrl = { key: string; origin: string };

export function parseSpaceUrl(url: string): SpaceUrl | null {
	const key = parseSpaceKeyInput(url);
	if (!key) return null;
	try {
		return { key, origin: new URL(url).origin };
	} catch {
		return null;
	}
}
