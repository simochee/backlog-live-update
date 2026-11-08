import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyStarMapPatch } from "./apply-star-map-patch";
import { buildStarMapPatch } from "./build-star-map-patch";
import {
	type CommentStarItem,
	findCommentStarMapHook,
	findCommentStateHook,
} from "./react-fiber";

/**
 * Backlog の課題画面と同じ hook 並びを持つ最小 component。
 * `useStarsForIssueComments`(starMap → 読み込みキュー)の後に `useIssueComments` の
 * comment state が続き、各コメントのスター数は starMap を直接読んで描画する。
 */
function IssuePage() {
	const [starMap] = useState<Record<string, CommentStarItem[]>>({});
	useState({ isLoading: false, queue: [] });
	const [commentData] = useState({
		issueId: 1,
		commentIds: [1],
		comments: [{ id: 1 }],
	});
	return (
		<ul>
			{commentData.comments.map((c) => (
				<li key={c.id} data-comment-id={c.id}>
					{(starMap[c.id] ?? []).length}
				</li>
			))}
		</ul>
	);
}

/** 課題画面より前に描画され、無関係な空 object を state に持つ component。 */
function Header() {
	useState({});
	return <header />;
}

function App() {
	return (
		<>
			<Header />
			<IssuePage />
		</>
	);
}

const displayedStarCount = (commentId: number) =>
	document.querySelector(`[data-comment-id="${commentId}"]`)?.textContent;

/** comment-bridge の fetchAppend と同じ手順で、コメントを state 末尾へ追記する。 */
function appendComment(id: number) {
	const found = findCommentStateHook();
	if (!found) throw new Error("comment state hook not found");
	const { state } = found;
	found.dispatch({
		...state,
		commentIds: [...state.commentIds, id],
		comments: [...state.comments, { id }],
	});
}

/** content の probe と comment-bridge の patchStarMap と同じ手順で、スターを同期する。 */
function syncStars(stars: Record<number, number>) {
	const comments = Object.entries(stars).map(([id, count]) => ({
		id: Number(id),
		stars: Array.from({ length: count }, (_, i) => ({
			id: Number(id) * 100 + i,
			url: `https://example.backlog.com/view/A-1#comment-${id}`,
			presenter: { id: 10 + i, name: `user${i}` },
		})),
	}));
	const knownIds = new Set(Object.keys(stars));
	const patch = buildStarMapPatch(comments, knownIds);

	const found = findCommentStarMapHook();
	if (!found) return;
	const { next, changed } = applyStarMapPatch(found.state, patch);
	if (changed) found.dispatch(next);
}

let root: Root | undefined;

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
	act(() => root?.unmount());
	root = undefined;
	document.body.replaceChildren();
});

describe("live で追記したコメントのスター同期", () => {
	it("スターが 1 件も無い課題で追記したコメントに付いたスターが画面に反映される", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root?.render(<App />));

		act(() => appendComment(2));
		expect(displayedStarCount(2)).toBe("0");

		act(() => syncStars({ 1: 0, 2: 1 }));

		expect(displayedStarCount(2)).toBe("1");
	});

	it("追記したコメントのスターが外されると画面のスター数が 0 に戻る", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root?.render(<App />));
		act(() => appendComment(2));
		act(() => syncStars({ 1: 0, 2: 1 }));

		act(() => syncStars({ 1: 0, 2: 0 }));

		expect(displayedStarCount(2)).toBe("0");
	});
});
