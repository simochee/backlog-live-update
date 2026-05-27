import { fetchInternalComments } from "../utils/fetch-internal-comments";
import { type CommentState, findCommentStateHook } from "../utils/react-fiber";

/**
 * MAIN world(ページの JS context)で動く bridge。isolated content script から
 * `injectScript` され、CustomEvent で双方向通信する。
 *
 * - `lfb:request-state` 受信 → fiber から現在の issueId と最新 comment id(minId)を
 *   読み取り `lfb:state` で返す(content script 側の public API polling 用)。
 * - `lfb:fetch-append` 受信 → 内部 API で render-ready な comment を取得し、現在の
 *   state に dedup して append する。cookie 認証の fetch を page context で行うため、
 *   取得も注入もこの world 内で完結させる。
 *
 * CustomEvent の detail はオブジェクトのまま渡すと world 境界で読めないことがあるため、
 * JSON 文字列でやり取りする。
 */
export default defineUnlistedScript(() => {
	const script = document.currentScript;
	if (!script) return;

	script.addEventListener("lfb:request-state", () => {
		const found = findCommentStateHook();
		const detail = found
			? (() => {
					const { issueId, commentIds, comments } = found.state;
					const ids = [...commentIds, ...comments.map((c) => c.id)];
					return {
						found: true,
						issueId,
						minId: ids.length > 0 ? Math.max(...ids) : 0,
					};
				})()
			: { found: false };
		script.dispatchEvent(
			new CustomEvent("lfb:state", { detail: JSON.stringify(detail) }),
		);
	});

	script.addEventListener("lfb:fetch-append", () => {
		void (async () => {
			const before = findCommentStateHook();
			if (!before) return;

			const comments = await fetchInternalComments(before.state.issueId);
			if (!comments) return;

			// fetch 中に画面側が更新している可能性があるため、append 直前に再読み取りする。
			const found = findCommentStateHook();
			if (!found) return;

			const current = found.state;
			const knownIds = new Set([
				...current.commentIds,
				...current.comments.map((c) => c.id),
			]);
			const fresh = comments.filter((c) => !knownIds.has(c.id));
			if (fresh.length === 0) return;

			const next: CommentState = {
				...current,
				commentIds: [...current.commentIds, ...fresh.map((c) => c.id)],
				comments: [...current.comments, ...fresh],
			};
			found.dispatch(next);
		})();
	});
});
