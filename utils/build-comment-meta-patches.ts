import type { CommentMetaPatch } from "./bridge-protocol";

// public API の content/changeLog は画面の整形済み state と形が違うため、メタ情報だけを受け取る。
export interface PublicCommentMeta {
	id: number;
	notifications:
		| { id: number; resourceAlreadyRead: boolean }[]
		| null
		| undefined;
}

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
					// alreadyRead は通知センターの既読であり、コメントの実閲覧を表さない。
					alreadyRead: n.resourceAlreadyRead,
				}))
			: [];
		out.push({ commentId: c.id, notifications });
	}
	return out;
}
