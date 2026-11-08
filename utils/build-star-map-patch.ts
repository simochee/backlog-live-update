import type { StarMapPatch } from "./bridge-protocol";
import { isCommentIdKey } from "./comment-id";

export interface PublicCommentStars {
	id: number;
	stars:
		| {
				id: number;
				url: string;
				presenter: { id: number; name: string } | null | undefined;
		  }[]
		| null
		| undefined;
}

export function buildStarMapPatch(
	comments: readonly PublicCommentStars[],
	targetIds: ReadonlySet<string>,
): StarMapPatch {
	const byCommentId: StarMapPatch["byCommentId"] = {};
	for (const c of comments) {
		const cid = String(c.id);
		if (!isCommentIdKey(cid) || !targetIds.has(cid)) continue;
		const stars = Array.isArray(c.stars) ? c.stars : [];
		const cleaned: StarMapPatch["byCommentId"][string] = [];
		for (const s of stars) {
			const presenter = s.presenter;
			if (!presenter) continue;
			cleaned.push({
				id: s.id,
				url: s.url,
				userId: presenter.id,
				userName: presenter.name,
				// public API の CDN URL は画面が期待する内部 icon path と異なるため使わない。
				userIcon: `NulabAccountIcon.action?userId=${presenter.id}&name=large`,
			});
		}
		byCommentId[cid] = cleaned;
	}
	return { byCommentId };
}
