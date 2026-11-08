import * as v from "valibot";
import { type PageComment, PageCommentSchema } from "./react-fiber";

const InternalCommentsSchema = v.object({
	comments: v.array(PageCommentSchema),
});

// public API のコメントは画面の整形済み state と互換でないため、内部 API から取得する。
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

	const result = v.safeParse(InternalCommentsSchema, json);
	return result.success ? result.output.comments : null;
}
