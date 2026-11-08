import * as v from "valibot";

const IssueMetaSchema = v.object({ id: v.number(), updated: v.string() });
export type IssueMeta = v.InferOutput<typeof IssueMetaSchema>;

/**
 * 課題の最新 meta(`id` と `updated`)を public REST API から取得する。polling の鮮度
 * probe 用途。
 *
 * backlog-js の `getIssue` は params を取らず fetch の `cache` も制御できないため、同一
 * URL の GET が HTTP cache で stale 化し `updated` が進まない。ここでは `cache: "no-store"`
 * と cache-bust param(`_`)で確実に最新を取りに行く。content script(isolated world)から
 * same-origin で叩くため CORS は発生せず、apiKey は query param で認証する。
 *
 * 失敗(HTTP error / network / 想定外 shape)時は null を返し、呼び出し側で tick を skip。
 */
export async function fetchIssueMeta(
	host: string,
	apiKey: string | undefined,
	issueIdOrKey: string,
): Promise<IssueMeta | null> {
	const params = new URLSearchParams({
		apiKey: apiKey ?? "",
		_: String(Date.now()),
	});

	let json: unknown;
	try {
		const res = await fetch(
			`https://${host}/api/v2/issues/${encodeURIComponent(issueIdOrKey)}?${params}`,
			{ cache: "no-store" },
		);
		if (!res.ok) return null;
		json = await res.json();
	} catch {
		return null;
	}

	const result = v.safeParse(IssueMetaSchema, json);
	return result.success ? result.output : null;
}
