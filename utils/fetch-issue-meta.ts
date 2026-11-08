import { createClient, getIssue } from "backlog-js";
import * as v from "valibot";

const IssueMetaSchema = v.object({ id: v.number(), updated: v.string() });
export type IssueMeta = v.InferOutput<typeof IssueMetaSchema>;

export async function fetchIssueMeta(
	host: string,
	apiKey: string | undefined,
	issueIdOrKey: string,
): Promise<IssueMeta | null> {
	let json: unknown;
	try {
		const client = createClient({
			host,
			apiKey,
			// HTTP cache の古い応答では updated が進まないため、既定の fetch は使わない。
			fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
		});
		json = await getIssue(client, encodeURIComponent(issueIdOrKey));
	} catch {
		return null;
	}

	const result = v.safeParse(IssueMetaSchema, json);
	return result.success ? result.output : null;
}
