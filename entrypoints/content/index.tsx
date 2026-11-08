import { Backlog } from "backlog-js";
import { BACKLOG_HOST_MATCHES, issueKeyFromPath } from "@/utils/backlog";
import {
	BRIDGE_EVENT,
	parseStateResponse,
	type StateResponse,
} from "@/utils/bridge-protocol";
import { buildCommentMetaPatches } from "@/utils/build-comment-meta-patches";
import { buildStarMapPatch } from "@/utils/build-star-map-patch";
import { debugLog } from "@/utils/debug-log";
import { fetchIssueMeta } from "@/utils/fetch-issue-meta";
import { createLiveStateMessage } from "@/utils/live-state-message";
import { onElementAppear } from "@/utils/on-element-appear";
import { pollWhileVisible } from "@/utils/poll-while-visible";
import { parseSettings, settingsStorage } from "@/utils/settings";
import "./style.css";

/** bridge へ state を要求してから応答を諦めるまでの猶予。 */
const BRIDGE_STATE_TIMEOUT_MS = 3000;

/**
 * probe で取得する直近 comment 件数。画面末尾 N 件分の通知既読等メタ差分を 1 call で拾うための窓。
 * 大きいほど巻き戻り耐性が上がるが public API の payload も比例増 → 実用バランスで 20。
 */
const PROBE_WINDOW = 20;

/** 課題 1 件を監視するための文脈。 */
interface IssueWatchContext {
	backlog: Backlog;
	script: HTMLScriptElement;
	host: string;
	apiKey: string;
	issueKey: string;
	isActive: () => boolean;
}

/** bridge へ現在の state を要求し、応答(または timeout)を待つ。 */
function requestBridgeState(script: HTMLScriptElement): Promise<StateResponse> {
	return new Promise((resolve) => {
		const onState = (event: Event) => {
			cleanup();
			resolve(
				event instanceof CustomEvent
					? parseStateResponse(event.detail)
					: { found: false },
			);
		};
		const cleanup = () => {
			clearTimeout(timer);
			script.removeEventListener(BRIDGE_EVENT.state, onState);
		};
		const timer = setTimeout(() => {
			cleanup();
			resolve({ found: false });
		}, BRIDGE_STATE_TIMEOUT_MS);
		script.addEventListener(BRIDGE_EVENT.state, onState);
		script.dispatchEvent(new CustomEvent(BRIDGE_EVENT.requestState));
	});
}

/**
 * comment probe: bridge から現在 state を取り、画面末尾 N 件分の window で public API を 1 call。
 * 役割は 2 つ:
 *
 * - **新規検知**: 取得した最大 id が現末尾より大きければ「新規あり」→ bridge に
 *   `fetchAppend`(内部 API で render-ready 取得 → append)を依頼する。
 * - **メタ patch**: 既存 comment の `notifications`(既読フラグ等)に差分があれば、
 *   `patchCommentMeta` で fiber 上の該当 field のみを直接書き換えさせる。content/changeLog
 *   等は public API と内部 state で shape が異なる(HTML 整形済か否か)ため触らない。
 */
async function probeAndPatch({
	backlog,
	script,
	isActive,
}: IssueWatchContext): Promise<void> {
	try {
		const state = await requestBridgeState(script);
		if (!isActive() || !state.found || state.issueId == null) return;

		const recentIds = state.recentIds ?? [];
		const sorted = [...recentIds].sort((a, b) => a - b);
		const tail = sorted.at(-1) ?? 0;
		// 画面末尾 N 件分を含む window を取りたいので、N+1 件目の id を minId(exclusive)に渡す。
		// それ未満しか持っていなければ 0 から全件。
		const windowMinId =
			sorted.length > PROBE_WINDOW
				? sorted[sorted.length - PROBE_WINDOW - 1]
				: 0;

		const comments = await backlog.getIssueComments(state.issueId, {
			minId: windowMinId,
			count: PROBE_WINDOW,
			order: "asc",
		});
		if (!isActive() || comments.length === 0) return;

		const hasNew = comments.some((c) => c.id > tail);
		if (hasNew) {
			script.dispatchEvent(new CustomEvent(BRIDGE_EVENT.fetchAppend));
		}

		// 既存 id についてのみ meta を patch(新規分は fetchAppend が render-ready で持ち込む)。
		const knownIds = new Set(sorted);
		const patches = buildCommentMetaPatches(comments, knownIds);
		if (patches.length > 0) {
			script.dispatchEvent(
				new CustomEvent(BRIDGE_EVENT.patchCommentMeta, {
					detail: JSON.stringify(patches),
				}),
			);
		}

		// 既存 id について star もまとめて patch(starMap key は string)。
		const knownIdStrs = new Set(sorted.map((n) => String(n)));
		const starPatch = buildStarMapPatch(comments, knownIdStrs);
		if (Object.keys(starPatch.byCommentId).length > 0) {
			script.dispatchEvent(
				new CustomEvent(BRIDGE_EVENT.patchStarMap, {
					detail: JSON.stringify(starPatch),
				}),
			);
		}
	} catch {
		// comment probe 失敗(network / rate limit 等)。issue 監視は続行する。
	}
}

/**
 * 課題 1 件分の監視 callback を生成する。`lastUpdated` を closure に保持し、生成時に baseline
 * を即 fetch する(起動〜初回 tick の間に起きた変化も初回 tick で拾えるようにするため)。
 * 返す callback は poll tick ごとに comment probe と issue-updated probe を実行する。
 */
function createIssueWatcher(ctx: IssueWatchContext): () => Promise<void> {
	const { script, host, apiKey, issueKey } = ctx;
	let lastUpdated: string | undefined;

	// 課題詳細の updated 監視。backlog-js の getIssue は HTTP cache で stale 化し updated が
	// 進まないため、no-store で叩く fetchIssueMeta を使う(失敗時は null を返す)。
	const probeIssueUpdated = async () => {
		const issue = await fetchIssueMeta(host, apiKey, issueKey);
		if (!ctx.isActive()) return;
		if (!issue) {
			debugLog("issue probe returned null (skip tick)", { issueKey });
			return;
		}
		if (lastUpdated === undefined) {
			lastUpdated = issue.updated;
			debugLog("issue baseline recorded", { issueKey, updated: issue.updated });
			return;
		}
		// updated は ISO 8601 文字列。辞書順比較で時刻の前後が判定できる。
		if (issue.updated > lastUpdated) {
			const from = lastUpdated;
			lastUpdated = issue.updated;
			script.dispatchEvent(
				new CustomEvent(BRIDGE_EVENT.revalidateIssue, {
					detail: JSON.stringify({ issueKey, issueId: issue.id }),
				}),
			);
			debugLog("issue updated advanced → dispatched revalidate", {
				issueId: issue.id,
				from,
				to: issue.updated,
			});
		}
	};

	void probeIssueUpdated(); // 起動時点の updated を即 baseline 化する。

	return async () => {
		if (!ctx.isActive()) return;
		await probeAndPatch(ctx);
		if (ctx.isActive()) await probeIssueUpdated();
	};
}

export default defineContentScript({
	matches: [...BACKLOG_HOST_MATCHES],

	async main(ctx) {
		const { interval, space } = parseSettings(await settingsStorage.getValue());
		if (ctx.isInvalid) return;
		const [currentSpaceKey] = location.hostname.split(".");

		if (!space.key || space.key !== currentSpaceKey) return;

		debugLog("content live setup start", {
			spaceKey: space.key,
			host: location.hostname,
		});

		const backlog = new Backlog({
			host: location.hostname,
			apiKey: space.apiKey,
		});

		// fiber 操作は MAIN world でしか動かないため bridge を注入する。
		const { script } = await injectScript("/comment-bridge.js", {
			keepInDom: true,
		});
		if (ctx.isInvalid) return;

		const intervalMs = interval * 1000;
		let stopPoll: (() => void) | undefined;
		let pollAlive = false;

		// background へ live 起動状態を伝える(badge 表示用)。tab スコープ管理は
		// background 側で sender.tab.id を見て行う。
		const notifyLiveState = (active: boolean) => {
			debugLog("notify live-state", { active });
			void browser.runtime
				.sendMessage(createLiveStateMessage(active))
				.catch((err) => debugLog("notify live-state failed", err));
		};

		// polling は `pollWhileVisible` 内で tab hidden 時に timer を clear する。
		// badge も同タイミングで OFF にする → visibility と pollAlive の AND を送る。
		const syncLiveState = () => {
			notifyLiveState(pollAlive && document.visibilityState === "visible");
		};

		ctx.addEventListener(document, "visibilitychange", syncLiveState);
		// hard navigation / tab close 直前に badge を消す(tab close 自体は browser
		// 側で badge state が GC されるが、同 tab 内 hard navigation 対策)。
		ctx.addEventListener(window, "pagehide", () => notifyLiveState(false));

		const disposePoll = () => {
			stopPoll?.();
			stopPoll = undefined;
			pollAlive = false;
			syncLiveState();
		};

		// SPA navigation 検出: content script は isolated world → MAIN world の
		// history.pushState を patch できない。pathname を軽量 polling し、課題詳細
		// から離脱した瞬間に polling を止めて badge を OFF にする。
		ctx.addEventListener(window, "wxt:locationchange", ({ newUrl, oldUrl }) => {
			if (newUrl.pathname !== oldUrl.pathname) disposePoll();
		});

		const stopAppear = onElementAppear("#comments", () => {
			if (ctx.isInvalid) return;
			const issueKey = issueKeyFromPath(location.pathname);
			if (!issueKey) return;

			// 課題切り替え等で #comments が再出現したら前回の polling を止める。
			stopPoll?.();
			stopPoll = pollWhileVisible(
				createIssueWatcher({
					backlog,
					script,
					host: location.hostname,
					apiKey: space.apiKey,
					issueKey,
					isActive: () => ctx.isValid && pollAlive,
				}),
				intervalMs,
			);
			pollAlive = true;
			syncLiveState();
		});
		ctx.onInvalidated(() => {
			disposePoll();
			stopAppear();
		});
	},
});
