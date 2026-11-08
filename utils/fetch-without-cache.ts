// HTTP cache の古い応答では updated やコメントの変更を検知できないため、既定の fetch は使わない。
export const fetchWithoutCache: typeof fetch = (input, init) =>
	fetch(input, { ...init, cache: "no-store" });
