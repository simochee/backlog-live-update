import { defineConfig } from "wxt";
import { BACKLOG_HOST_MATCHES } from "./utils/backlog";

export default defineConfig({
	manifestVersion: 3,
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	manifest: ({ browser }) => ({
		name: "Live for Backlog",
		description: "Keep Backlog alive without reloading.",
		permissions: ["storage"],
		...(browser === "firefox"
			? {
					browser_specific_settings: {
						gecko: {
							id: "live-for-backlog@simochee.net",
							strict_min_version: "140.0",
							data_collection_permissions: {
								required: ["authenticationInfo", "browsingActivity"],
							},
						},
					},
				}
			: {}),
		web_accessible_resources: [
			{
				resources: ["comment-bridge.js"],
				matches: [...BACKLOG_HOST_MATCHES],
			},
		],
	}),
});
