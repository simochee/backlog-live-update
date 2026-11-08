import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element #root not found");
}

createRoot(root).render(
	<StrictMode>
		<Suspense fallback={<div>Loading...</div>}>
			<App />
		</Suspense>
	</StrictMode>,
);
