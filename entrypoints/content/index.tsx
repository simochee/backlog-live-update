import { Backlog } from "backlog-js";
import { debugLog } from "../../utils/debug-log";
import { fetchIssueMeta } from "../../utils/fetch-issue-meta";
import "./style.css";

/** MAIN world bridge から返る state 応答。 */
interface StateResponse {
	found: boolean;
	issueId?: number;
	minId?: number;
}

export default defineContentScript({
	matches: [
		"*://*.backlog.com/*",
		"*://*.backlog.jp/*",
		"*://*.backlogtool.com/*",
	],

	async main() {
		const settings = parseSettings(await settingsStorage.getValue());
		const { id: spaceId, apiKey } = settings.spaces[0] ?? {};
		const [currentSpaceId] = location.hostname.split(".");

		if (spaceId !== currentSpaceId) return;

		debugLog("content live setup start", { spaceId, host: location.hostname });

		const backlog = new Backlog({ host: location.hostname, apiKey });

		// fiber 操作は MAIN world でしか動かないため bridge を注入する。
		const { script } = await injectScript("/comment-bridge.js", {
			keepInDom: true,
		});

		/** bridge へ現在の state を要求し、応答(または timeout)を待つ。 */
		const requestState = (timeoutMs = 3000) =>
			new Promise<StateResponse>((resolve) => {
				const onState = (event: Event) => {
					cleanup();
					if (!(event instanceof CustomEvent)) return resolve({ found: false });
					try {
						resolve(JSON.parse(event.detail));
					} catch {
						resolve({ found: false });
					}
				};
				const cleanup = () => {
					clearTimeout(timer);
					script.removeEventListener("lfb:state", onState);
				};
				const timer = setTimeout(() => {
					cleanup();
					resolve({ found: false });
				}, timeoutMs);
				script.addEventListener("lfb:state", onState);
				script.dispatchEvent(new CustomEvent("lfb:request-state"));
			});

		let stopPoll: (() => void) | undefined;

		onElementAppear("#comments", () => {
			const [, issueKey] =
				location.pathname.match(/^\/view\/([A-Z0-9_]+-[0-9]+)/) ?? [];

			if (!issueKey) return;

			// 課題切り替え等で #comments が再出現したら前回の polling を止める。
			stopPoll?.();
			let lastUpdated: string | undefined;
			// 起動時点の updated を即 baseline 化 → 起動後に変化していれば初回 tick から trigger。
			void fetchIssueMeta(location.hostname, apiKey, issueKey).then(
				(initial) => {
					if (initial && lastUpdated === undefined) {
						lastUpdated = initial.updated;
						debugLog("issue startup baseline recorded", {
							issueKey,
							updated: initial.updated,
						});
					}
				},
			);
			stopPoll = pollWhileVisible(
				async () => {
					// --- 既存: comment probe(state 要求 → public API probe → fetch-append) ---
					try {
						const state = await requestState();
						if (state.found && state.issueId != null) {
							// 高頻度の polling 負荷は public API へ。最新 id より新しい comment が
							// あるかだけを最小ペイロードで確認する。
							const probe = await backlog.getIssueComments(state.issueId, {
								minId: state.minId,
								count: 1,
								order: "desc",
							});
							if (probe.length > 0) {
								// 実データ取得と注入は MAIN world bridge が内部 API(render-ready)で行う。
								script.dispatchEvent(new CustomEvent("lfb:fetch-append"));
							}
						}
					} catch {
						// comment probe 失敗(network / rate limit 等)。issue 監視は続行する。
					}

					// --- 追加: 課題詳細の updated 監視 → 進んだら revalidate 依頼 ---
					// backlog-js の getIssue は HTTP cache で stale 化し updated が進まないため、
					// no-store で叩く自前 probe を使う。
					try {
						const issue = await fetchIssueMeta(
							location.hostname,
							apiKey,
							issueKey,
						);
						if (!issue) {
							debugLog("issue probe returned null (skip tick)", { issueKey });
						} else if (lastUpdated === undefined) {
							lastUpdated = issue.updated; // 初回は baseline 記録のみ
							debugLog("issue baseline recorded", {
								issueKey,
								updated: issue.updated,
							});
						} else if (issue.updated > lastUpdated) {
							// updated は ISO 8601 文字列。辞書順比較で時刻前後が判定できる。
							const from = lastUpdated;
							lastUpdated = issue.updated;
							// dispatch を log より先に行い、log 失敗が dispatch を妨げないようにする。
							script.dispatchEvent(
								new CustomEvent("lfb:revalidate-issue", {
									detail: JSON.stringify({ issueKey, issueId: issue.id }),
								}),
							);
							debugLog("issue updated advanced → dispatched revalidate", {
								issueId: issue.id,
								from,
								to: issue.updated,
							});
						}
						// 変化なしの tick は毎分出るスパムになるため log しない。
					} catch (err) {
						// network / rate limit 等。この tick は skip し次回継続。
						debugLog("getIssue failed", err);
					}
				},
				settings.interval * 60 * 1000,
			);
		});
	},
});
