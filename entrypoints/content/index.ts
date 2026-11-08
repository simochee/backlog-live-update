import { createClient, getIssueComments } from "backlog-js";
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
import { fetchWithoutCache } from "@/utils/fetch-without-cache";
import { createLiveStateMessage } from "@/utils/live-state-message";
import { onElementAppear } from "@/utils/on-element-appear";
import { pollWhileVisible } from "@/utils/poll-while-visible";
import { parseSettings, settingsStorage } from "@/utils/settings";

/** bridge へ state を要求してから応答を諦めるまでの猶予。 */
const BRIDGE_STATE_TIMEOUT_MS = 3000;

/**
 * probe で取得する直近 comment 件数。画面末尾 N 件分の通知既読等メタ差分を 1 call で拾うための窓。
 * 大きいほど巻き戻り耐性が上がるが public API の payload も比例増 → 実用バランスで 20。
 */
const PROBE_WINDOW = 20;

/** 課題 1 件を監視するための文脈。 */
interface IssueWatchContext {
	backlog: ReturnType<typeof createClient>;
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

		const comments = await getIssueComments(backlog, state.issueId, {
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
		const [currentSpaceKey] = location.hostname.split(".");
		let stopPoll: (() => void) | undefined;
		let stopAppear: (() => void) | undefined;
		let pollAlive = false;
		let generation = 0;
		let settingsChanged = false;
		let bridge: ReturnType<typeof injectScript> | undefined;

		const notifyLiveState = (active: boolean) => {
			void browser.runtime
				.sendMessage(createLiveStateMessage(active))
				.catch((err) => debugLog("notify live-state failed", err));
		};
		const syncLiveState = () => {
			notifyLiveState(pollAlive && document.visibilityState === "visible");
		};
		const disposePoll = () => {
			generation++;
			stopPoll?.();
			stopPoll = undefined;
			pollAlive = false;
			syncLiveState();
		};
		const restart = async (raw: unknown) => {
			disposePoll();
			stopAppear?.();
			stopAppear = undefined;
			const version = generation;
			const { interval, space } = parseSettings(raw);
			if (ctx.isInvalid || !space.key || space.key !== currentSpaceKey) return;
			// fiber 操作は MAIN world でしか動かないため bridge を注入する。
			bridge ??= injectScript("/comment-bridge.js", { keepInDom: true });
			const { script } = await bridge;
			if (ctx.isInvalid || version !== generation) return;
			const backlog = createClient({
				host: location.hostname,
				apiKey: space.apiKey,
				fetch: fetchWithoutCache,
			});
			const start = () => {
				if (ctx.isInvalid) return;
				const issueKey = issueKeyFromPath(location.pathname);
				if (!issueKey) return;
				disposePoll();
				const pollVersion = generation;
				pollAlive = true;
				stopPoll = pollWhileVisible(
					createIssueWatcher({
						backlog,
						script,
						host: location.hostname,
						apiKey: space.apiKey,
						issueKey,
						isActive: () =>
							ctx.isValid &&
							pollAlive &&
							pollVersion === generation &&
							issueKeyFromPath(location.pathname) === issueKey,
					}),
					interval * 1000,
				);
				syncLiveState();
			};
			stopAppear = onElementAppear("#comments", start);
			if (document.querySelector("#comments")) start();
		};
		ctx.addEventListener(document, "visibilitychange", syncLiveState);
		ctx.addEventListener(window, "pagehide", disposePoll);
		ctx.addEventListener(window, "wxt:locationchange", ({ newUrl, oldUrl }) => {
			if (newUrl.pathname !== oldUrl.pathname) disposePoll();
		});
		const unwatch = settingsStorage.watch((value) => {
			settingsChanged = true;
			void restart(value);
		});
		ctx.onInvalidated(() => {
			disposePoll();
			stopAppear?.();
			unwatch();
		});
		const initialSettings = await settingsStorage.getValue();
		if (!ctx.isInvalid && !settingsChanged) await restart(initialSettings);
	},
});
