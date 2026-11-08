import { defineConfig } from "wxt";
import { BACKLOG_HOST_MATCHES } from "./utils/backlog";

export default defineConfig({
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	manifest: {
		name: "Live for Backlog",
		description: "Keep Backlog alive without reloading.",
		permissions: ["storage"],
		web_accessible_resources: [
			{
				resources: ["comment-bridge.js"],
				matches: [...BACKLOG_HOST_MATCHES],
			},
		],
	},
});
