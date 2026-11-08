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

export function pullRequestRefFromPath(
	pathname: string,
): { projectKey: string; repoName: string; number: number } | undefined {
	const match = pathname.match(
		/^\/git\/([^/]+)\/([^/]+)\/pullRequests\/([1-9]\d*)\/?$/,
	);
	if (!match?.[1] || !match[2]) return;
	try {
		const number = Number(match[3]);
		if (!Number.isSafeInteger(number)) return;
		return {
			projectKey: decodeURIComponent(match[1]),
			repoName: decodeURIComponent(match[2]),
			number,
		};
	} catch {
		return;
	}
}
