const DEBUG_ENABLED =
	import.meta.env.DEV || import.meta.env.WXT_DEBUG_LOG === "true";

export function debugLog(...args: unknown[]): void {
	if (DEBUG_ENABLED) {
		// console.debug は DevTools の既定表示で隠れるため、console.log を使う。
		// biome-ignore lint/suspicious/noConsole: 調査用ログ(dev / WXT_DEBUG_LOG 限定)。
		console.log("[blu]", ...args);
	}
}
