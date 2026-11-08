import { storage } from "#imports";
import { parseSpaceKeyInput } from "./settings";

export type SuggestedSpace = { key: string; origin: string };

export function parseSuggestedSpace(url?: string): SuggestedSpace | null {
	if (!url) return null;
	const key = parseSpaceKeyInput(url);
	if (!key) return null;
	try {
		return { key, origin: new URL(url).origin };
	} catch {
		return null;
	}
}

export const suggestedSpaceStorage = storage.defineItem<SuggestedSpace | null>(
	"session:suggestedSpace",
	{ fallback: null },
);
