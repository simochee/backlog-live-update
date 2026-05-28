import type { StarMapPatch } from "./bridge-protocol";

/**
 * public API `/api/v2/issues/:key/comments` のレスポンスから本拡張が触る最小 shape。
 * `stars` 各要素の field 由来:
 *
 * - `id`: そのまま fiber 上 star item の `id`。
 * - `url`: そのまま `url`(画面側でも `view/...#comment-<id>` をそのまま保持)。
 * - `presenter.id`: fiber 上 `userId`(number)。
 * - `presenter.name`: fiber 上 `userName`。
 * - icon の元: fiber 上 `userIcon` には Backlog 内部 endpoint
 *   `NulabAccountIcon.action?userId=<presenter.id>&name=large` の path を組み立てて入れる
 *   (画面が同形式を期待しているため。public の `presenter.nulabAccount.iconUrl` は
 *   nulab CDN 直リンクなので形が違い、画面側が `userIcon.startsWith(...)` 等で path
 *   prefix を検査している場合に壊れる)。
 */
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

/**
 * public API の comment 配列から、fiber 上 starMap に直接書き戻せる `StarMapPatch` を作る。
 *
 * - `targetIds` は「現 starMap が key として持つ comment id 集合」相当。新規 comment
 *   (まだ画面が知らない id)は append 経路で fiber に入るため、ここでは触らない。
 * - `targetIds` に含まれていても probe レスポンスに stars が無ければ「star 0 件」として
 *   空配列を patch する(全部 unstar された状態の同期)。
 * - presenter が無い star は不正データとして捨てる。
 */
export function buildStarMapPatch(
	comments: readonly PublicCommentStars[],
	targetIds: ReadonlySet<string>,
): StarMapPatch {
	const byCommentId: StarMapPatch["byCommentId"] = {};
	for (const c of comments) {
		const cid = String(c.id);
		if (!targetIds.has(cid)) continue;
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
				userIcon: `NulabAccountIcon.action?userId=${presenter.id}&name=large`,
			});
		}
		byCommentId[cid] = cleaned;
	}
	return { byCommentId };
}
