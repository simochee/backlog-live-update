import type { StarMapPatch } from "./bridge-protocol";
import type { CommentStarItem, CommentStarMap } from "./react-fiber";

/**
 * 同じ commentId の現 stars と patch stars が「実質同じ」かを判定する。
 *
 * - 長さが違えば差分あり
 * - `id` の集合が違えば差分あり
 * - 同一 `id` どうしで `userName` / `userIcon` / `userId` / `url` が違えば差分あり
 *
 * 配列の順序は問わない(画面側が presenter id 順等で sort する保証がなく、サーバ側で
 * 順序が変わる可能性があるため)。順序差で無駄 dispatch を出さないようにする。
 */
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

/**
 * 現 starMap に patch を適用して「次 starMap」と「変化があったか」を返す。
 *
 * - patch.byCommentId に出てくる commentId のみ更新対象。それ以外の entry は維持。
 * - 同 commentId で実質同じ stars なら参照を維持(無駄 re-render を抑える)。
 * - patch 反映後に変化が 1 件もなければ `changed: false` を返し、呼び出し側で dispatch
 *   を skip させる。
 */
export function applyStarMapPatch(
	current: CommentStarMap,
	patch: StarMapPatch,
): { next: CommentStarMap; changed: boolean } {
	let changed = false;
	const next: CommentStarMap = { ...current };
	for (const [cid, rawNext] of Object.entries(patch.byCommentId)) {
		// patch 要素は `comment` を持たないので、fiber 形(`comment: null` 含む)に補完する。
		// 画面 component が `star.comment` を読むケースで undefined 化を避けるため。
		const nextStars: CommentStarItem[] = rawNext.map((s) => ({
			...s,
			comment: null,
		}));
		const cur = current[cid] ?? [];
		if (isSameStars(cur, nextStars)) {
			// 参照同一性を保つため明示的に元参照を入れ直す(spread で消えない保証)。
			if (cid in current) next[cid] = current[cid];
			continue;
		}
		next[cid] = nextStars;
		changed = true;
	}
	if (!changed) return { next: current, changed: false };
	return { next, changed: true };
}
