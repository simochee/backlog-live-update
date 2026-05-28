import type { CommentMetaPatch } from "./bridge-protocol";
import type { CommentState, PageComment } from "./react-fiber";

/**
 * 内部 state(`CommentState`)に含まれる「comment 1 件分の通知配列」要素の最小 shape。
 * `notificationId` で public API 側の `id` と紐付け、`alreadyRead` を上書きする。
 */
interface NotifyResource {
	notificationId: number;
	alreadyRead: boolean;
	[key: string]: unknown;
}

function isNotifyResource(value: unknown): value is NotifyResource {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.notificationId === "number" && typeof v.alreadyRead === "boolean"
	);
}

/**
 * 現 state と patch 配列から「次 state」と「実際に変化があったか」を返す。
 *
 * - 変化判定は alreadyRead の値比較のみ(false→true / true→false の双方向)。Backlog 側で
 *   既読化が起きると false → true、未読化(通常は起きないが念のため)なら true → false。
 * - 変化が無ければ呼び出し側で `dispatch` を呼ばず無駄 render を避けるため、`changed: false`
 *   を返す。
 * - public API レスポンスに含まれない comment(画面外の旧 comment)や、対応する
 *   notificationId が fiber 側に無い場合は触らない(部分更新)。
 */
export function applyCommentMetaPatch(
	state: CommentState,
	patches: readonly CommentMetaPatch[],
): { next: CommentState; changed: boolean } {
	if (patches.length === 0) return { next: state, changed: false };

	const patchById = new Map(patches.map((p) => [p.commentId, p]));
	let changed = false;

	const nextComments: PageComment[] = state.comments.map((comment) => {
		const patch = patchById.get(comment.id);
		if (!patch) return comment;

		const current = comment.notifyResource;
		if (!Array.isArray(current)) return comment;

		const wantById = new Map(
			patch.notifications.map((n) => [n.id, n.alreadyRead]),
		);

		let commentChanged = false;
		const nextNotify = current.map((n) => {
			if (!isNotifyResource(n)) return n;
			const want = wantById.get(n.notificationId);
			if (want === undefined || want === n.alreadyRead) return n;
			commentChanged = true;
			return { ...n, alreadyRead: want };
		});

		if (!commentChanged) return comment;
		changed = true;
		return { ...comment, notifyResource: nextNotify };
	});

	if (!changed) return { next: state, changed: false };
	return {
		next: { ...state, comments: nextComments },
		changed: true,
	};
}
