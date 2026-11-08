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
import {
	effectiveConfigForHost,
	parseSettings,
	settingsStorage,
} from "@/utils/settings";

const BRIDGE_STATE_TIMEOUT_MS = 3000;

// 全履歴を毎回取得すると payload が増えるため、直近のメタ変更を拾う窓を 20 件に絞る。
const PROBE_WINDOW = 20;

interface IssueWatchContext {
	backlog: ReturnType<typeof createClient>;
	script: HTMLScriptElement;
	host: string;
	apiKey: string;
	issueKey: string;
	isActive: () => boolean;
}

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

		const knownIds = new Set(sorted);
		const patches = buildCommentMetaPatches(comments, knownIds);
		if (patches.length > 0) {
			script.dispatchEvent(
				new CustomEvent(BRIDGE_EVENT.patchCommentMeta, {
					detail: JSON.stringify(patches),
				}),
			);
		}

		const knownIdStrs = new Set(sorted.map((n) => String(n)));
		const starPatch = buildStarMapPatch(comments, knownIdStrs);
		if (Object.keys(starPatch.byCommentId).length > 0) {
			script.dispatchEvent(
				new CustomEvent(BRIDGE_EVENT.patchStarMap, {
					detail: JSON.stringify(starPatch),
				}),
			);
		}
	} catch {}
}

function createIssueWatcher(ctx: IssueWatchContext): () => Promise<void> {
	const { script, host, apiKey, issueKey } = ctx;
	let lastUpdated: string | undefined;

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

	void probeIssueUpdated();

	return async () => {
		if (!ctx.isActive()) return;
		await probeAndPatch(ctx);
		if (ctx.isActive()) await probeIssueUpdated();
	};
}

export default defineContentScript({
	matches: [...BACKLOG_HOST_MATCHES],

	async main(ctx) {
		let effectiveConfig: ReturnType<typeof effectiveConfigForHost>;
		let stopPoll: (() => void) | undefined;
		let stopAppear: (() => void) | undefined;
		let pollAlive = false;
		let watchedIssueKey: string | undefined;
		let generation = 0;
		let settingsChanged = false;
		let bridge: ReturnType<typeof injectScript> | undefined;

		const notifyLiveState = (active: boolean) => {
			try {
				void browser.runtime
					.sendMessage(createLiveStateMessage(active))
					.catch((err) => debugLog("notify live-state failed", err));
			} catch (err) {
				debugLog("notify live-state failed", err);
			}
		};
		const syncLiveState = () => {
			notifyLiveState(pollAlive && document.visibilityState === "visible");
		};
		const disposePoll = () => {
			generation++;
			stopPoll?.();
			stopPoll = undefined;
			pollAlive = false;
			watchedIssueKey = undefined;
			syncLiveState();
		};
		const restart = async (raw: unknown) => {
			const next = effectiveConfigForHost(
				parseSettings(raw),
				location.hostname,
			);
			if (
				next?.interval === effectiveConfig?.interval &&
				next?.apiKey === effectiveConfig?.apiKey
			)
				return;
			effectiveConfig = next;
			disposePoll();
			stopAppear?.();
			stopAppear = undefined;
			const version = generation;
			if (ctx.isInvalid || !next) return;
			const { interval, apiKey } = next;

			// fiber 操作は MAIN world でしか動かないため、bridge を注入する。
			bridge ??= injectScript("/comment-bridge.js", { keepInDom: true });
			const { script } = await bridge;
			if (ctx.isInvalid || version !== generation) return;
			const backlog = createClient({
				host: location.hostname,
				apiKey,
				fetch: fetchWithoutCache,
			});
			const start = () => {
				if (ctx.isInvalid) return;
				const issueKey = issueKeyFromPath(location.pathname);
				if (!issueKey) return;
				// 既存の #comments には同期呼び出しと onElementAppear の両方から届く。作り直すと
				// baseline 取得が重複し、badge も一瞬消えるため、同じ課題の監視中は何もしない。
				if (pollAlive && watchedIssueKey === issueKey) return;
				disposePoll();
				const pollVersion = generation;
				pollAlive = true;
				watchedIssueKey = issueKey;
				stopPoll = pollWhileVisible(
					createIssueWatcher({
						backlog,
						script,
						host: location.hostname,
						apiKey,
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
			// 非表示タブでは animation が走らず onElementAppear が発火しないことがあるため、
			// 既にある要素には同期でも開始する。
			if (document.querySelector("#comments")) start();
		};
		ctx.addEventListener(document, "visibilitychange", syncLiveState);
		ctx.addEventListener(window, "pagehide", disposePoll);
		ctx.addEventListener(window, "wxt:locationchange", ({ newUrl, oldUrl }) => {
			if (
				newUrl.pathname !== oldUrl.pathname &&
				pollAlive &&
				issueKeyFromPath(newUrl.pathname) !== watchedIssueKey
			)
				disposePoll();
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
