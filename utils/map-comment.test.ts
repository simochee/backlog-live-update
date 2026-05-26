import type { Entity } from "backlog-js";
import { describe, expect, it } from "vitest";
import { mapComment } from "./map-comment";

const baseComment = (): Entity.Issue.Comment => ({
	id: 100,
	projectId: 1,
	issueId: 42,
	content: "新しい **コメント**\n2行目",
	changeLog: [],
	createdUser: {
		id: 7,
		userId: "simochee",
		name: "Ryoya",
		roleType: 2,
		lang: "ja",
		mailAddress: "simochee@example.com",
		lastLoginTime: "2026-05-27T00:00:00Z",
	},
	created: "2026-05-27T01:00:00Z",
	updated: "2026-05-27T02:00:00Z",
	stars: [],
	notifications: [],
});

/** local tz 依存を避けるため、テスト側でも同じ整形ロジックで期待値を導出する。 */
const expectedDate = (iso: string) => {
	const date = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

describe("mapComment", () => {
	it("backlog-js Comment を実測した PageComment 形状へ変換する", () => {
		const icon = "NulabAccountIcon.action?userId=7&name=large";
		expect(mapComment(baseComment())).toEqual({
			id: 100,
			name: "Ryoya",
			icon,
			createdUserId: "simochee",
			createdUser: {
				id: 7,
				userId: "simochee",
				uniqueId: "simochee",
				name: "Ryoya",
				mailAddress: "simochee@example.com",
				roleType: 2,
				keyword: "Ryoya",
				lang: "ja",
				icon,
			},
			createdOn: expectedDate("2026-05-27T01:00:00Z"),
			updatedOn: expectedDate("2026-05-27T02:00:00Z"),
			content:
				'<div class="markdown-body"><p>新しい **コメント**<br>2行目</p></div>',
			plainContent: "新しい **コメント**\n2行目",
			changelog: [],
			notifyResource: [],
			mentionsInContent: null,
		});
	});

	it("content の HTML 特殊文字を escape する(XSS 防止)", () => {
		const comment = baseComment();
		comment.content = '<script>alert(1)</script> & "x"';
		expect(mapComment(comment).content).toBe(
			'<div class="markdown-body"><p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "x"</p></div>',
		);
	});

	it("createdOn は YYYY/MM/DD HH:mm:ss 形式になる", () => {
		expect(mapComment(baseComment()).createdOn).toMatch(
			/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/,
		);
	});

	it("lang が null の場合はそのまま null を保持する", () => {
		const comment = baseComment();
		comment.createdUser.lang = null;
		expect(mapComment(comment).createdUser.lang).toBeNull();
	});
});
