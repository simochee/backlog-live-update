import { debugLog } from "../utils/debug-log";
import { fetchInternalComments } from "../utils/fetch-internal-comments";
import { highlightComments } from "../utils/highlight-comments";
import {
	type CommentState,
	findCommentStateHook,
	findQueryClient,
} from "../utils/react-fiber";
import { revalidateIssueQueries } from "../utils/revalidate-issue-queries";

/**
 * MAIN world(ページの JS context)で動く bridge。isolated content script から
 * `injectScript` され、CustomEvent で双方向通信する。
 *
 * - `lfb:request-state` 受信 → fiber から現在の issueId と最新 comment id(minId)を
 *   読み取り `lfb:state` で返す(content script 側の public API polling 用)。
 * - `lfb:fetch-append` 受信 → 内部 API で render-ready な comment を取得し、現在の
 *   state に dedup して append する。cookie 認証の fetch を page context で行うため、
 *   取得も注入もこの world 内で完結させる。
 * - `lfb:revalidate-issue` 受信 → fiber から QueryClient を取得し、当該課題に関連する
 *   TanStack Query を invalidate する(Backlog 自身に再 fetch・再 render させる)。
 *
 * CustomEvent の detail はオブジェクトのまま渡すと world 境界で読めないことがあるため、
 * JSON 文字列でやり取りする。
 */
export default defineUnlistedScript(() => {
	const script = document.currentScript;
	if (!script) return;

	debugLog("bridge: injected into MAIN world");

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

			// 投稿直後と同じ更新ハイライトを新規 comment に付ける。id セレクタで狙うため
			// React が render 前でも、要素出現時に rule が適用される。
			highlightComments(fresh.map((c) => c.id));
		})();
	});

	script.addEventListener("lfb:revalidate-issue", (event) => {
		if (!(event instanceof CustomEvent)) return;

		let issue: { issueKey: string; issueId: number };
		try {
			issue = JSON.parse(event.detail) as { issueKey: string; issueId: number };
		} catch (err) {
			debugLog("bridge: revalidate-issue bad payload", err);
			return; // 自拡張が送る JSON。壊れていれば no-op。
		}

		debugLog("bridge: revalidate-issue received", issue);

		const client = findQueryClient();
		if (!client) {
			debugLog("bridge: QueryClient not found");
			return;
		}

		try {
			const count = revalidateIssueQueries(client, issue);
			debugLog("bridge: invalidated queries", {
				issueKey: issue.issueKey,
				issueId: issue.issueId,
				invalidated: count,
			});
			if (count === 0) {
				// 何も match しなかった → queryKey 形状を確認するため全 key を出す。
				debugLog(
					"bridge: no match, all queryKeys",
					client
						.getQueryCache()
						.getAll()
						.map((q) => q.queryKey),
				);
			}
		} catch (err) {
			// 未文書の React/QueryClient 内部構造依存。壊れても静かに no-op し画面を壊さない。
			debugLog("bridge: invalidate failed", err);
		}
	});
});
