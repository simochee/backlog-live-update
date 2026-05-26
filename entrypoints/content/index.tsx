import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

export default defineContentScript({
	matches: [
		"*://*.backlog.com/*",
		"*://*.backlog.jp/*",
		"*://*.backlogtool.com/*",
	],
	cssInjectionMode: "ui",

	async main(ctx) {
		const ui = await createShadowRootUi(ctx, {
			name: "live-for-backlog-ui",
			position: "inline",
			anchor: "body",
			onMount: (container) => {
				const wrapper = document.createElement("div");
				container.append(wrapper);

				const root = createRoot(wrapper);
				root.render(<App />);
				return root;
			},
			onRemove: (root) => {
				root?.unmount();
			},
		});

		ui.mount();
	},
});
