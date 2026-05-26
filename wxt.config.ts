import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: {
		name: "Live for Backlog",
		description: "Keep Backlog alive without reloading.",
		permissions: ["storage"],
		web_accessible_resources: [
			{
				resources: ["comment-bridge.js"],
				matches: [
					"*://*.backlog.com/*",
					"*://*.backlog.jp/*",
					"*://*.backlogtool.com/*",
				],
			},
		],
	},
});
