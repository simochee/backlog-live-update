import { Backlog } from "backlog-js";
import { mapComment } from "../../utils/map-comment";
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
			stopPoll = pollWhileVisible(
				async () => {
					const state = await requestState();
					if (!state.found || state.issueId == null) return;

					const comments = await backlog.getIssueComments(state.issueId, {
						minId: state.minId,
						order: "asc",
						count: 100,
					});
					if (comments.length === 0) return;

					script.dispatchEvent(
						new CustomEvent("lfb:append", {
							detail: JSON.stringify({ comments: comments.map(mapComment) }),
						}),
					);
				},
				settings.interval * 60 * 1000,
			);
		});
	},
});
