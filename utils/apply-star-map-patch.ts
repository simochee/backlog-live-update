import type { StarMapPatch } from "./bridge-protocol";
import { isCommentIdKey } from "./comment-id";
import type { CommentStarItem, CommentStarMap } from "./react-fiber";

// サーバからの順序は一定でないため、配列順だけの違いでは再描画しない。
function isSameStars(
	current: readonly CommentStarItem[],
	next: readonly CommentStarItem[],
): boolean {
	if (current.length !== next.length) return false;
	const byId = new Map<number, CommentStarItem>();
	for (const c of current) byId.set(c.id, c);
	for (const n of next) {
		const c = byId.get(n.id);
		if (!c) return false;
		if (
			c.userId !== n.userId ||
			c.userName !== n.userName ||
			c.userIcon !== n.userIcon ||
			c.url !== n.url
		)
			return false;
	}
	return true;
}

export function applyStarMapPatch(
	current: CommentStarMap,
	patch: StarMapPatch,
): { next: CommentStarMap; changed: boolean } {
	let changed = false;
	const next: CommentStarMap = { ...current };
	for (const [cid, rawNext] of Object.entries(patch.byCommentId)) {
		if (!isCommentIdKey(cid)) continue;
		// 画面は star.comment を読むため、public API にない field を null で補う。
		const nextStars: CommentStarItem[] = rawNext.map((s) => ({
			...s,
			comment: null,
		}));
		const cur = current[cid] ?? [];
		if (isSameStars(cur, nextStars)) {
			if (cid in current) next[cid] = cur;
			continue;
		}
		next[cid] = nextStars;
		changed = true;
	}
	if (!changed) return { next: current, changed: false };
	return { next, changed: true };
}
