/**
 * `[lfb]` prefix 付きのデバッグログ。live 機能の検知/invalidate を切り分ける可視化用途。
 *
 * 有効になる条件:
 * - dev build(`npm run dev` / `wxt`)では常時(`import.meta.env.DEV === true`)。
 * - 本番相当の `wxt build` で出したい場合は `WXT_DEBUG_LOG=true npm run build` のように
 *   env var を付けてビルドする。WXT は `WXT_` / `VITE_` prefix の env var を
 *   `import.meta.env` 経由で bundle に露出する。
 *
 * いずれも満たさない通常の本番ビルドでは下記 `if` が false に畳まれ no-op になる。
 */
const DEBUG_ENABLED =
	import.meta.env.DEV || import.meta.env.WXT_DEBUG_LOG === "true";

export function debugLog(...args: unknown[]): void {
	if (DEBUG_ENABLED) {
		// console.debug は DevTools default level で隠れるため console.log を使う。
		// biome-ignore lint/suspicious/noConsole: 調査用ログ(dev / WXT_DEBUG_LOG 限定)。
		console.log("[lfb]", ...args);
	}
}
