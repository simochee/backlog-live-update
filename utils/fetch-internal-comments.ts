import type { PageComment } from "./react-fiber";

/**
 * Backlog の内部 endpoint `GetInitialComments.action` から、画面 state と同一の
 * render-ready な comment を取得する。レスポンスの `comments` 要素はそのまま state へ
 * 差し込める形(HTML 済み content・整形済み changelog・icon URL 等)のため変換は不要。
 *
 * cookie 認証(same-origin)で apiKey 不要。確実に cookie を載せるため MAIN world
 * (ページの JS context)から呼ぶ前提。`limit` は必須 param(欠くと 400)。
 *
 * 未文書 API のため、応答の shape が変われば null を返し、呼び出し側で no-op にする。
 */
export async function fetchInternalComments(
	issueId: number,
	limit = 100,
): Promise<PageComment[] | null> {
	const params = new URLSearchParams({
		issueId: String(issueId),
		limit: String(limit),
		includeOrigin: "true",
	});

	let json: unknown;
	try {
		const res = await fetch(`/GetInitialComments.action?${params}`, {
			headers: { "X-Requested-With": "XMLHttpRequest" },
			credentials: "same-origin",
		});
		if (!res.ok) return null;
		json = await res.json();
	} catch {
		return null;
	}

	if (typeof json !== "object" || json === null) return null;
	const { comments } = json as { comments?: unknown };
	if (!Array.isArray(comments)) return null;
	return comments as PageComment[];
}
