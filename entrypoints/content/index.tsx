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

		// biome-ignore lint/suspicious/noConsole: 開発中の暫定確認
		console.log(await backlog.getMyself());

		onElementAppear("#comments", () => {
			// biome-ignore lint/suspicious/noConsole: 開発中の暫定確認
			console.log("comments appeared");
		});
	},
});
