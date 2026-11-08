import * as v from "valibot";
import type { CommentMetaPatch } from "./bridge-protocol";
import type { CommentState, PageComment } from "./react-fiber";

const NotifyResourceSchema = v.looseObject({
	notificationId: v.union([v.number(), v.nan()]),
	alreadyRead: v.boolean(),
});
type NotifyResource = v.InferOutput<typeof NotifyResourceSchema>;

function isNotifyResource(value: unknown): value is NotifyResource {
	return v.is(NotifyResourceSchema, value);
}

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
