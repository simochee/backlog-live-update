/**
 * Backlog の URL / ホスト規約を 1 箇所に集約する。Backlog 側の変更時に追従点をここへ
 * 閉じ込めるのが狙い。純粋な定数と関数のみで構成し、`#imports` 等の拡張専用 API には
 * 依存しない(`wxt.config.ts` からも安全に import できるようにするため)。
 */

/**
 * Backlog SaaS の全ドメイン。content script の `matches` と manifest の
 * `web_accessible_resources` で同じ集合を共有する。
 */
export const BACKLOG_HOST_MATCHES = [
	"*://*.backlog.com/*",
	"*://*.backlog.jp/*",
	"*://*.backlogtool.com/*",
] as const;

/** 課題詳細 URL(`/view/PROJ-123`)から issueKey を取り出す。非該当は undefined。 */
export function issueKeyFromPath(pathname: string): string | undefined {
	const [, issueKey] = pathname.match(/^\/view\/([A-Z0-9_]+-[0-9]+)/) ?? [];
	return issueKey;
}
