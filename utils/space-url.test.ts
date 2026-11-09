import { expect, it } from "vite-plus/test";
import { parseSpaceUrl } from "./space-url";

it.each([
	"backlog.com",
	"backlog.jp",
	"backlogtool.com",
])("Backlog の URL からキーと origin だけを取り出す (%s)", (domain) => {
	expect(parseSpaceUrl(`https://NULAB.${domain}/view/P-1?q=secret`)).toEqual({
		key: "nulab",
		origin: `https://nulab.${domain}`,
	});
});

it.each([
	"",
	"nulab",
	"nulab.backlog.jp",
	"https://example.com",
	"https://nulab.backlog.jp.evil.com",
	"https://a.b.backlog.com",
	"https://user:pass@nulab.backlog.com",
	"https://nulab.backlog.com:8080",
	"file:///nulab.backlog.com",
])("Backlog スペースの URL でなければ null を返す (%s)", (url) => {
	expect(parseSpaceUrl(url)).toBeNull();
});
