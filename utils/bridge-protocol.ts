import * as v from "valibot";

// CustomEvent の detail はオブジェクトのままだと world 境界で失われ得るため、
// isolated world と MAIN world の間では JSON 文字列で授受する。
export const BRIDGE_EVENT = {
	requestState: "lfb:request-state",
	state: "lfb:state",
	fetchAppend: "lfb:fetch-append",
	revalidateIssue: "lfb:revalidate-issue",
	patchCommentMeta: "lfb:patch-comment-meta",
	patchStarMap: "lfb:patch-star-map",
} as const;

function validItems<TSchema extends v.GenericSchema>(schema: TSchema) {
	return v.pipe(
		v.array(v.unknown()),
		v.transform((items) =>
			items.flatMap((item) => {
				const result = v.safeParse(schema, item);
				return result.success ? [result.output] : [];
			}),
		),
	);
}

export const StateResponseSchema = v.pipe(
	v.object({
		found: v.boolean(),
		issueId: v.fallback(v.optional(v.number()), undefined),
		minId: v.fallback(v.optional(v.number()), undefined),
		recentIds: v.fallback(v.optional(v.array(v.number())), undefined),
	}),
	v.transform(({ found, issueId, minId, recentIds }) => ({
		found,
		...(issueId !== undefined ? { issueId } : {}),
		...(minId !== undefined ? { minId } : {}),
		...(recentIds !== undefined ? { recentIds } : {}),
	})),
);
export type StateResponse = v.InferOutput<typeof StateResponseSchema>;

export const IssueRefSchema = v.object({
	issueKey: v.string(),
	issueId: v.number(),
});
export type IssueRef = v.InferOutput<typeof IssueRefSchema>;

const NotificationPatchSchema = v.object({
	id: v.number(),
	alreadyRead: v.boolean(),
});
export const CommentMetaPatchSchema = v.object({
	commentId: v.number(),
	notifications: validItems(NotificationPatchSchema),
});
export type CommentMetaPatch = v.InferOutput<typeof CommentMetaPatchSchema>;
const CommentMetaPatchListSchema = validItems(CommentMetaPatchSchema);

const StarPatchSchema = v.object({
	id: v.number(),
	url: v.string(),
	userId: v.number(),
	userName: v.string(),
	userIcon: v.string(),
});
const StarPatchListSchema = validItems(StarPatchSchema);
const ObjectContainerSchema = v.object({});
// v.record は一部のキーを除去するため、既存のキーと配列コンテナをそのまま検証する。
const StarMapEntriesSchema = v.custom<object>((value) =>
	v.is(ObjectContainerSchema, value),
);
export const StarMapPatchSchema = v.object({
	byCommentId: v.pipe(
		StarMapEntriesSchema,
		v.transform((entries) => {
			const byCommentId: Record<
				string,
				v.InferOutput<typeof StarPatchListSchema>
			> = {};
			for (const [cid, items] of Object.entries(entries)) {
				const result = v.safeParse(StarPatchListSchema, items);
				if (result.success) byCommentId[cid] = result.output;
			}
			return byCommentId;
		}),
	),
});
export type StarMapPatch = v.InferOutput<typeof StarMapPatchSchema>;

function parseJson(detail: unknown): unknown {
	if (!v.is(v.string(), detail)) return null;
	try {
		return JSON.parse(detail);
	} catch {
		return null;
	}
}

export function parseStateResponse(detail: unknown): StateResponse {
	const result = v.safeParse(StateResponseSchema, parseJson(detail));
	return result.success ? result.output : { found: false };
}

export function parseIssueRef(detail: unknown): IssueRef | null {
	const result = v.safeParse(IssueRefSchema, parseJson(detail));
	return result.success ? result.output : null;
}

export function parseStarMapPatch(detail: unknown): StarMapPatch | null {
	const result = v.safeParse(StarMapPatchSchema, parseJson(detail));
	return result.success ? result.output : null;
}

export function parseCommentMetaPatchList(detail: unknown): CommentMetaPatch[] {
	const result = v.safeParse(CommentMetaPatchListSchema, parseJson(detail));
	return result.success ? result.output : [];
}
