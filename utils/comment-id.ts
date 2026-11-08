import * as v from "valibot";

const CommentIdKeySchema = v.pipe(v.string(), v.regex(/^[0-9]+$/));

export function isCommentIdKey(
	value: unknown,
): value is v.InferOutput<typeof CommentIdKeySchema> {
	return v.is(CommentIdKeySchema, value);
}
