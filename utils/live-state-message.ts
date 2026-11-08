import * as v from "valibot";

export const LiveStateMessageSchema = v.object({
	type: v.literal("live-state"),
	active: v.boolean(),
});
export type LiveStateMessage = v.InferOutput<typeof LiveStateMessageSchema>;

export function isLiveStateMessage(value: unknown): value is LiveStateMessage {
	return v.is(LiveStateMessageSchema, value);
}

export function createLiveStateMessage(active: boolean): LiveStateMessage {
	return { type: LiveStateMessageSchema.entries.type.literal, active };
}
