import { describe, expect, it } from "vitest";
import { applyCommentMetaPatch } from "./apply-comment-meta-patch";
import type { CommentState } from "./react-fiber";

function buildState(): CommentState {
	return {
		issueId: 100,
		commentIds: [],
		comments: [
			{
				id: 1,
				content: "<p>a</p>",
				notifyResource: [
					{ notificationId: 10, alreadyRead: false, extra: "x" },
					{ notificationId: 11, alreadyRead: false },
				],
			},
			{
				id: 2,
				content: "<p>b</p>",
				notifyResource: [],
			},
			{
				id: 3,
				content: "<p>c</p>",
				notifyResource: [{ notificationId: 30, alreadyRead: true }],
			},
		],
	};
}

describe("applyCommentMetaPatch", () => {
	it("alreadyRead を id マッチで上書きする(他 field は維持)", () => {
		const state = buildState();
		const { next, changed } = applyCommentMetaPatch(state, [
			{
				commentId: 1,
				notifications: [{ id: 10, alreadyRead: true }],
			},
		]);

		expect(changed).toBe(true);
		expect(next.comments[0].notifyResource).toEqual([
			{ notificationId: 10, alreadyRead: true, extra: "x" },
			{ notificationId: 11, alreadyRead: false },
		]);
		// 他 comment は触らない(参照同一)
		expect(next.comments[1]).toBe(state.comments[1]);
		expect(next.comments[2]).toBe(state.comments[2]);
	});

	it("差分なし(全 alreadyRead が一致)なら changed=false で state を返す", () => {
		const state = buildState();
		const { next, changed } = applyCommentMetaPatch(state, [
			{
				commentId: 1,
				notifications: [
					{ id: 10, alreadyRead: false },
					{ id: 11, alreadyRead: false },
				],
			},
			{ commentId: 3, notifications: [{ id: 30, alreadyRead: true }] },
		]);

		expect(changed).toBe(false);
		expect(next).toBe(state);
	});

	it("patch にない comment、対応 notificationId が無い comment は触らない", () => {
		const state = buildState();
		const { next, changed } = applyCommentMetaPatch(state, [
			{
				commentId: 2, // notifyResource 空 → 何も変わらない
				notifications: [{ id: 999, alreadyRead: true }],
			},
			{
				commentId: 99, // 存在しない comment → 無視
				notifications: [{ id: 1, alreadyRead: true }],
			},
		]);

		expect(changed).toBe(false);
		expect(next).toBe(state);
	});

	it("patches が空なら state を返す", () => {
		const state = buildState();
		const { next, changed } = applyCommentMetaPatch(state, []);
		expect(changed).toBe(false);
		expect(next).toBe(state);
	});

	it("true → false への戻し(未読化)も上書きする", () => {
		const state = buildState();
		const { next, changed } = applyCommentMetaPatch(state, [
			{
				commentId: 3,
				notifications: [{ id: 30, alreadyRead: false }],
			},
		]);
		expect(changed).toBe(true);
		expect(next.comments[2].notifyResource).toEqual([
			{ notificationId: 30, alreadyRead: false },
		]);
	});
});
