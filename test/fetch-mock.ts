import { vi } from "vite-plus/test";

/** グローバル `fetch` を差し替え、呼び出し記録付きの mock を返す。 */
export function mockFetch(impl: () => Response | Promise<Response>) {
	const fn = vi.fn<
		(
			input: string | URL | Request,
			init?: RequestInit,
		) => Response | Promise<Response>
	>(() => impl());
	vi.stubGlobal("fetch", fn);
	return fn;
}

/** `ok` と `json()` だけを備えた最小の Response ライク。 */
export function jsonResponse(body: unknown, ok = true): Response {
	return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}
