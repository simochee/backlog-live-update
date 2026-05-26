import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	autoIcons: {
		baseIconPath: "assets/icon.svg",
	},
	// TODO: popup chunk は RJSF + AJV で ~692kB（Vite 500kB 警告）。肥大化したら lazy load / 軽量 validator を検討
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	manifest: {
		name: "live-for-backlog",
		description: "Live enhancements for Backlog",
	},
});
