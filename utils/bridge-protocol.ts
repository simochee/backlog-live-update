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
} as const;

/** bridge が fiber から読んだ現在の表示 state。content の public API probe 用。 */
export interface StateResponse {
	found: boolean;
	issueId?: number;
	minId?: number;
}

/** revalidate / 課題識別に使う課題参照。 */
export interface IssueRef {
	issueKey: string;
	issueId: number;
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
	const { found, issueId, minId } = parsed as Record<string, unknown>;
	if (typeof found !== "boolean") return { found: false };
	return {
		found,
		...(typeof issueId === "number" ? { issueId } : {}),
		...(typeof minId === "number" ? { minId } : {}),
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
