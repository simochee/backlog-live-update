import { defineConfig } from "wxt";
import { BACKLOG_HOST_MATCHES } from "./utils/backlog";

export default defineConfig({
	manifestVersion: 3,
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	manifest: ({ browser }) => ({
		name: "Backlog Live Update",
		description:
			"Updates open Backlog issues and pull requests without reloading.",
		permissions: ["storage", "activeTab"],
		action: { default_title: "Backlog Live Update" },
		...(browser === "firefox"
			? {
					browser_specific_settings: {
						gecko: {
							id: "backlog-live-update@simochee.net",
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
