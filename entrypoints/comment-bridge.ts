import {
	type CommentState,
	findCommentStateHook,
	type PageComment,
} from "../utils/react-fiber";

/**
 * MAIN world(ページの JS context)で動く bridge。isolated content script から
 * `injectScript` され、CustomEvent で双方向通信する。
 *
 * - `lfb:request-state` 受信 → fiber から現在の issueId と最新 comment id(minId)を
 *   読み取り `lfb:state` で返す。
 * - `lfb:append` 受信 → 受け取った comment 群を現在の state に dedup して append する。
 *
 * CustomEvent の detail はオブジェクトのまま渡すと world 境界で読めないことがあるため、
 * JSON 文字列でやり取りする。
 */
export default defineUnlistedScript(() => {
	const script = document.currentScript;
	if (!script) return;

	const reply = (detail: unknown) => {
		script.dispatchEvent(
			new CustomEvent("lfb:state", { detail: JSON.stringify(detail) }),
		);
	};

	script.addEventListener("lfb:request-state", () => {
		const found = findCommentStateHook();
		if (!found) {
			reply({ found: false });
			return;
		}
		const { issueId, commentIds, comments } = found.state;
		const ids = [...commentIds, ...comments.map((c) => c.id)];
		const minId = ids.length > 0 ? Math.max(...ids) : 0;
		reply({ found: true, issueId, minId });
	});

	script.addEventListener("lfb:append", (event) => {
		if (!(event instanceof CustomEvent)) return;

		let incoming: PageComment[];
		try {
			incoming = (JSON.parse(event.detail).comments ?? []) as PageComment[];
		} catch {
			return;
		}
		if (incoming.length === 0) return;

		// fetch 中に画面側が更新している可能性があるため、append 直前に再読み取りする。
		const found = findCommentStateHook();
		if (!found) return;

		const current = found.state;
		const knownIds = new Set([
			...current.commentIds,
			...current.comments.map((c) => c.id),
		]);
		const fresh = incoming.filter((c) => !knownIds.has(c.id));
		if (fresh.length === 0) return;

		const next: CommentState = {
			...current,
			commentIds: [...current.commentIds, ...fresh.map((c) => c.id)],
			comments: [...current.comments, ...fresh],
		};
		found.dispatch(next);
	});
});
