// wxt.config.ts からも参照するため、拡張の実行環境専用 API には依存させない。
export const BACKLOG_HOST_MATCHES = [
	"*://*.backlog.com/*",
	"*://*.backlog.jp/*",
	"*://*.backlogtool.com/*",
] as const;

export function issueKeyFromPath(pathname: string): string | undefined {
	const [, issueKey] = pathname.match(/^\/view\/([A-Z0-9_]+-[0-9]+)/) ?? [];
	return issueKey;
}
