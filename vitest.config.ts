import { configDefaults, defineConfig } from "vite-plus";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
	plugins: [WxtVitest()],
	test: {
		environment: "happy-dom",
		exclude: [...configDefaults.exclude, "**/.cache/**"],
	},
});
