import { afterEach, describe, expect, it } from "vite-plus/test";
import { highlightComments } from "./highlight-comments";

afterEach(() => {
	document.head.replaceChildren();
});

describe("highlightComments", () => {
	it("指定したコメントが更新色でハイライトされる", () => {
		highlightComments([1, 2]);

		const style = document.getElementById("lfb-comment-highlight");
		expect(style).not.toBeNull();
		expect(style?.textContent).toContain(
			"#comment-item-1{background-color:var(--backgroundColorUpdate);}",
		);
		expect(style?.textContent).toContain(
			"#comment-item-2{background-color:var(--backgroundColorUpdate);}",
		);
	});

	it("後から指定したコメントも同じ stylesheet でハイライトされる", () => {
		highlightComments([1]);
		highlightComments([2]);

		expect(document.querySelectorAll("#lfb-comment-highlight").length).toBe(1);
		const text = document.getElementById("lfb-comment-highlight")?.textContent;
		expect(text).toContain("comment-item-1");
		expect(text).toContain("comment-item-2");
	});

	it("同じ id を複数回渡しても rule は重複しない", () => {
		highlightComments([1]);
		highlightComments([1, 2]);

		const text =
			document.getElementById("lfb-comment-highlight")?.textContent ?? "";
		expect(text.match(/#comment-item-1\{/g) ?? []).toHaveLength(1);
		expect(text).toContain("#comment-item-2{");
	});

	it("空配列なら style 要素を作らない", () => {
		highlightComments([]);
		expect(document.getElementById("lfb-comment-highlight")).toBeNull();
	});
});
