import type { CommentMetaPatch } from "./bridge-protocol";

/**
 * public API `/api/v2/issues/:key/comments` のレスポンス要素のうち、本拡張が触る field
 * のみを抽出した最小 shape。それ以外の field(content/changeLog/createdUser 等)は
 * patch 対象外のため受け取らない(public API と内部 state では shape が異なるため、
 * うっかり content 等を fiber に書き戻すと render-ready 化前の HTML 未整形値で画面が
 * 壊れる)。
 *
 * 通知 boolean は 2 つあるうち `resourceAlreadyRead`(= comment 本体を実際に閲覧したか)
 * を読む。これが内部 `notifyResource[].alreadyRead`(画面の既読アイコンの源)と
 * 意味的に等価で、もう一方の `alreadyRead`(= 通知センターで既読化したか)は別軸のため
 * 取り違えると「実閲覧済の通知が未読アイコンに巻き戻る」現象が起きる。
 */
export interface PublicCommentMeta {
	id: number;
	notifications:
		| { id: number; resourceAlreadyRead: boolean }[]
		| null
		| undefined;
}

/**
 * public API の comment 配列から、fiber に書き戻すべき `CommentMetaPatch[]` を作る。
 *
 * - `targetIds` は「画面が現に保持している comment id 集合」。それに含まれない id は
 *   別経路(`fetchAppend`)で新規取得・append される対象なので patch しない。
 * - notifications が null/undefined の要素はその comment に通知が無いことを意味する。
 *   後段の applyCommentMetaPatch で「fiber 側の notifyResource をどう扱うか」を決める。
 */
export function buildCommentMetaPatches(
	comments: readonly PublicCommentMeta[],
	targetIds: ReadonlySet<number>,
): CommentMetaPatch[] {
	const out: CommentMetaPatch[] = [];
	for (const c of comments) {
		if (!targetIds.has(c.id)) continue;
		const notifications = Array.isArray(c.notifications)
			? c.notifications.map((n) => ({
					id: n.id,
					alreadyRead: n.resourceAlreadyRead,
				}))
			: [];
		out.push({ commentId: c.id, notifications });
	}
	return out;
}
