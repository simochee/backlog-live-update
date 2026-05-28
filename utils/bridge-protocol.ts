/**
 * content script(isolated world)↔ comment-bridge(MAIN world)間の CustomEvent
 * protocol を集約する。world 境界は型システムの外であり、event 名や payload 形状を
 * 各 entrypoint で個別に書くと片方の変更が静かな breakage を生む。ここに event 名と
 * payload 型・parser を一元化し、両者に同じ contract を import させる。
 *
 * CustomEvent の detail はオブジェクトのまま渡すと world 境界で失われ得るため、必ず
 * JSON 文字列で授受する(serialize は呼び出し側で `JSON.stringify`、復元は本 module の
 * parser を使う)。
 */

/** bridge と content がやり取りする CustomEvent 名。 */
export const BRIDGE_EVENT = {
	/** content → bridge: 現在の表示 state を要求する。 */
	requestState: "lfb:request-state",
	/** bridge → content: 要求への応答(`StateResponse`)。 */
	state: "lfb:state",
	/** content → bridge: 内部 API で新規 comment を取得し append させる。 */
	fetchAppend: "lfb:fetch-append",
	/** content → bridge: 当該課題の TanStack Query を invalidate させる(`IssueRef`)。 */
	revalidateIssue: "lfb:revalidate-issue",
	/** content → bridge: 取得済み comment のメタ(通知既読等)を fiber 上で直接 patch する(`CommentMetaPatch[]`)。 */
	patchCommentMeta: "lfb:patch-comment-meta",
	/** content → bridge: comment ごとの star 配列を fiber 上 starMap に直接 patch する(`StarMapPatch`)。 */
	patchStarMap: "lfb:patch-star-map",
} as const;

/**
 * bridge が fiber から読んだ現在の表示 state。content の public API probe 用。
 * `recentIds` は画面が保持する comment id 全件(順序は画面上の表示順)。content 側で
 * 末尾 N 件分の window を切るのに使う。
 */
export interface StateResponse {
	found: boolean;
	issueId?: number;
	minId?: number;
	recentIds?: number[];
}

/** revalidate / 課題識別に使う課題参照。 */
export interface IssueRef {
	issueKey: string;
	issueId: number;
}

/**
 * 取得済み comment の「メタ(現状は notification 既読)のみ」を fiber に書き戻すための patch。
 * comment 本体(content/changelog 等)は public API では render-ready でないため触らず、
 * shape が安定している notification.alreadyRead のみを id マッチで上書きする。
 */
export interface CommentMetaPatch {
	commentId: number;
	notifications: { id: number; alreadyRead: boolean }[];
}

/**
 * comment 用 starMap の patch payload。`byCommentId` は probe で見えている comment id 群と
 * その star 配列(画面 starMap と同 shape の要素配列)。bridge 側で「現 starMap と差分が
 * あるものだけ」差し替え、対象外 commentId(probe window 外)はそのまま残す。
 */
export interface StarMapPatch {
	byCommentId: Record<
		string,
		{
			id: number;
			url: string;
			userId: number;
			userName: string;
			userIcon: string;
		}[]
	>;
}

function parseJson(detail: unknown): unknown {
	if (typeof detail !== "string") return null;
	try {
		return JSON.parse(detail);
	} catch {
		return null;
	}
}

/** CustomEvent.detail(JSON 文字列)を `StateResponse` へ復元。不正は `{ found: false }`。 */
export function parseStateResponse(detail: unknown): StateResponse {
	const parsed = parseJson(detail);
	if (typeof parsed !== "object" || parsed === null) return { found: false };
	const { found, issueId, minId, recentIds } = parsed as Record<
		string,
		unknown
	>;
	if (typeof found !== "boolean") return { found: false };
	return {
		found,
		...(typeof issueId === "number" ? { issueId } : {}),
		...(typeof minId === "number" ? { minId } : {}),
		...(Array.isArray(recentIds) &&
		recentIds.every((v) => typeof v === "number")
			? { recentIds: recentIds as number[] }
			: {}),
	};
}

/** CustomEvent.detail(JSON 文字列)を `IssueRef` へ復元。不正は null。 */
export function parseIssueRef(detail: unknown): IssueRef | null {
	const parsed = parseJson(detail);
	if (typeof parsed !== "object" || parsed === null) return null;
	const { issueKey, issueId } = parsed as Record<string, unknown>;
	if (typeof issueKey !== "string" || typeof issueId !== "number") return null;
	return { issueKey, issueId };
}

/**
 * CustomEvent.detail(JSON 文字列)を `StarMapPatch` へ復元。要素単位で型を絞り、不正な
 * star item は捨てる。空(全 commentId 0 件)は no-op として呼出側で扱う。
 */
export function parseStarMapPatch(detail: unknown): StarMapPatch | null {
	const parsed = parseJson(detail);
	if (typeof parsed !== "object" || parsed === null) return null;
	const { byCommentId } = parsed as Record<string, unknown>;
	if (typeof byCommentId !== "object" || byCommentId === null) return null;
	const out: StarMapPatch["byCommentId"] = {};
	for (const [cid, items] of Object.entries(
		byCommentId as Record<string, unknown>,
	)) {
		if (!Array.isArray(items)) continue;
		const cleaned: StarMapPatch["byCommentId"][string] = [];
		for (const it of items) {
			if (typeof it !== "object" || it === null) continue;
			const item = it as Record<string, unknown>;
			if (
				typeof item.id !== "number" ||
				typeof item.url !== "string" ||
				typeof item.userId !== "number" ||
				typeof item.userName !== "string" ||
				typeof item.userIcon !== "string"
			)
				continue;
			cleaned.push({
				id: item.id,
				url: item.url,
				userId: item.userId,
				userName: item.userName,
				userIcon: item.userIcon,
			});
		}
		out[cid] = cleaned;
	}
	return { byCommentId: out };
}

/**
 * CustomEvent.detail(JSON 文字列)を `CommentMetaPatch[]` へ復元。world 境界越しに
 * 想定外 shape が来た場合に bridge 側を壊さないよう、要素単位で型を絞り不正要素は捨てる。
 * 全要素が不正なら空配列を返す(呼び出し側で no-op に倒す)。
 */
export function parseCommentMetaPatchList(detail: unknown): CommentMetaPatch[] {
	const parsed = parseJson(detail);
	if (!Array.isArray(parsed)) return [];
	const out: CommentMetaPatch[] = [];
	for (const item of parsed) {
		if (typeof item !== "object" || item === null) continue;
		const { commentId, notifications } = item as Record<string, unknown>;
		if (typeof commentId !== "number") continue;
		if (!Array.isArray(notifications)) continue;
		const cleaned: { id: number; alreadyRead: boolean }[] = [];
		for (const n of notifications) {
			if (typeof n !== "object" || n === null) continue;
			const { id, alreadyRead } = n as Record<string, unknown>;
			if (typeof id !== "number" || typeof alreadyRead !== "boolean") continue;
			cleaned.push({ id, alreadyRead });
		}
		out.push({ commentId, notifications: cleaned });
	}
	return out;
}
