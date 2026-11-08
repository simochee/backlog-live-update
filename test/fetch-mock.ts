import { vi } from "vite-plus/test";

export function mockFetch(impl: () => Response | Promise<Response>) {
	const fn = vi.fn<
		(
			input: string | URL | Request,
			init?: RequestInit,
		) => Response | Promise<Response>
	>(async () => impl());
	vi.stubGlobal("fetch", fn);
	return fn;
}

export function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		headers: new Headers({ "Content-Type": "application/json" }),
		json: () => Promise.resolve(body),
	} as unknown as Response;
}
