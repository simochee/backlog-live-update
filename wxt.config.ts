import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: {
		name: "live-for-backlog",
		description: "Live enhancements for Backlog",
	},
});
