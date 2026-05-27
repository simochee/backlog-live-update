import { Backlog } from "backlog-js";
import { BACKLOG_HOST_MATCHES, issueKeyFromPath } from "@/utils/backlog";
import {
	BRIDGE_EVENT,
	parseStateResponse,
	type StateResponse,
} from "@/utils/bridge-protocol";
import { debugLog } from "@/utils/debug-log";
import { fetchIssueMeta } from "@/utils/fetch-issue-meta";
import { onElementAppear } from "@/utils/on-element-appear";
import { pollWhileVisible } from "@/utils/poll-while-visible";
import { parseSettings, settingsStorage } from "@/utils/settings";
import "./style.css";

/** bridge へ state を要求してから応答を諦めるまでの猶予。 */
const BRIDGE_STATE_TIMEOUT_MS = 3000;

/** 課題 1 件を監視するための文脈。 */
interface IssueWatchContext {
	backlog: Backlog;
	script: HTMLScriptElement;
	host: string;
	apiKey: string;
	issueKey: string;
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
 * comment probe: bridge から現在 state を取り、「最新 id より新しい comment があるか」だけを
 * 最小ペイロードで public API に問い合わせる。あれば bridge に内部 API での取得・append を
 * 依頼する(実データ取得も注入も MAIN world 側で render-ready に行う)。
 */
async function probeNewComments({
	backlog,
	script,
}: IssueWatchContext): Promise<void> {
	try {
		const state = await requestBridgeState(script);
		if (!state.found || state.issueId == null) return;

		const probe = await backlog.getIssueComments(state.issueId, {
			minId: state.minId,
			count: 1,
			order: "desc",
		});
		if (probe.length > 0) {
			script.dispatchEvent(new CustomEvent(BRIDGE_EVENT.fetchAppend));
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
		await probeNewComments(ctx);
		await probeIssueUpdated();
	};
}

export default defineContentScript({
	matches: [...BACKLOG_HOST_MATCHES],

	async main() {
		const { interval, space } = parseSettings(await settingsStorage.getValue());
		const [currentSpaceId] = location.hostname.split(".");

		if (!space.id || space.id !== currentSpaceId) return;

		debugLog("content live setup start", {
			spaceId: space.id,
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

		const intervalMs = interval * 60 * 1000;
		let stopPoll: (() => void) | undefined;

		onElementAppear("#comments", () => {
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
				}),
				intervalMs,
			);
		});
	},
});
