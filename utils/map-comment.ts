import type { Entity } from "backlog-js";
import type { PageComment } from "./react-fiber";

/** state へ直接差し込むため、HTML 特殊文字を escape する(XSS 防止)。 */
const escapeHtml = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ISO 文字列を Backlog 表示形式 `YYYY/MM/DD HH:mm:ss`(ブラウザの local tz)へ整形する。 */
const formatDate = (iso: string): string => {
	const date = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** Nulab アカウントアイコンの URL を user id から組み立てる。 */
const iconUrl = (userId: number): string =>
	`NulabAccountIcon.action?userId=${userId}&name=large`;

/**
 * backlog-js(public REST API)の Comment を、Backlog 画面 state の PageComment へ
 * 変換する。実画面の構造を fiber 実測で確認した結果に合わせている。
 *
 * 制約: public API の `content` は markdown source のため HTML へ render できない。
 * 安全のため escape し改行のみ `<br>` 化して `markdown-body` でラップするが、`**bold**`
 * 等の記法は生表示となる(prototype の既知の制約)。また opaque な userId は API から
 * 取得できないため、login id(`uniqueId` 相当)を userId にも流用している。
 */
export function mapComment(comment: Entity.Issue.Comment): PageComment {
	const { createdUser } = comment;
	const icon = iconUrl(createdUser.id);
	return {
		id: comment.id,
		name: createdUser.name,
		icon,
		createdUserId: createdUser.userId,
		createdUser: {
			id: createdUser.id,
			userId: createdUser.userId,
			uniqueId: createdUser.userId,
			name: createdUser.name,
			mailAddress: createdUser.mailAddress ?? "",
			roleType: createdUser.roleType,
			keyword: createdUser.name,
			lang: createdUser.lang ?? null,
			icon,
		},
		createdOn: formatDate(comment.created),
		updatedOn: formatDate(comment.updated),
		content: `<div class="markdown-body"><p>${escapeHtml(comment.content).replace(/\n/g, "<br>")}</p></div>`,
		plainContent: comment.content,
		changelog: [],
		notifyResource: [],
		mentionsInContent: null,
	};
}
