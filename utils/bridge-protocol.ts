import * as v from "valibot";
import { isCommentIdKey } from "./comment-id";

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
		recentIds: v.fallback(v.optional(v.array(v.number())), undefined),
	}),
	v.transform(({ found, issueId, recentIds }) => ({
		found,
		...(issueId !== undefined ? { issueId } : {}),
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
export const StarMapPatchSchema = v.object({
	byCommentId: v.pipe(
		v.record(v.string(), v.unknown()),
		v.transform((entries) =>
			Object.fromEntries<v.InferOutput<typeof StarPatchListSchema>>(
				Object.entries(entries).flatMap(([cid, items]) => {
					if (!isCommentIdKey(cid)) return [];
					const result = v.safeParse(StarPatchListSchema, items);
					return result.success ? [[cid, result.output]] : [];
				}),
			),
		),
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
