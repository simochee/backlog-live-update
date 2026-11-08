import { createClient, getIssue } from "backlog-js";
import * as v from "valibot";
import { fetchWithoutCache } from "./fetch-without-cache";

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
			fetch: fetchWithoutCache,
		});
		json = await getIssue(client, encodeURIComponent(issueIdOrKey));
	} catch {
		return null;
	}

	const result = v.safeParse(IssueMetaSchema, json);
	return result.success ? result.output : null;
}
