import { Backlog } from "backlog-js";
import "./style.css";

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

		onElementAppear("#comments", () => {
			const [, issueKey] =
				location.pathname.match(/^\/view\/([A-Z0-9_]+-[0-9]+)/) ?? [];

			if (!issueKey) return;

			pollWhileVisible(
				async () => {
					// biome-ignore lint/suspicious/noConsole: 開発中の暫定確認
					console.log(await backlog.getIssueComments(issueKey, {}));

					// biome-ignore lint/suspicious/noConsole: 開発中の暫定確認
					console.log("Checking for new comments...");
				},
				settings.interval * 60 * 1000,
			);
		});
	},
});
