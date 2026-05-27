/** ハイライト rule を溜める自前 style 要素の id。 */
const STYLE_ELEMENT_ID = "lfb-comment-highlight";

/**
 * 注入した新規 comment に、投稿直後と同じ更新ハイライトを付ける。
 *
 * Backlog は投稿時に `.comment-item.is_target { background-color: var(--backgroundColorUpdate) }`
 * を当てるが、`is_target` は React 制御下の className のため付与しても再 render で剥がれる。
 * そこで className には触れず、安定した comment item の `id`(`comment-item-<id>`)を狙う
 * 自前 stylesheet へ rule を追記する。色は同じ theme 変数 `--backgroundColorUpdate` を
 * 参照するため、テーマと完全に一致する。
 */
export function highlightComments(ids: number[]): void {
	if (ids.length === 0) return;

	let style = document.getElementById(
		STYLE_ELEMENT_ID,
	) as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement("style");
		style.id = STYLE_ELEMENT_ID;
		document.head.appendChild(style);
	}

	// ハイライト済み id を style 要素自身に持たせ(真実源を DOM へ一元化)、毎回 rule 全体を
	// 再生成する。これで重複 rule の累積や単調な textContent 成長を防ぐ。
	const highlighted = new Set<number>(
		JSON.parse(style.dataset.ids ?? "[]") as number[],
	);
	for (const id of ids) highlighted.add(id);

	style.dataset.ids = JSON.stringify([...highlighted]);
	style.textContent = [...highlighted]
		.map(
			(id) =>
				`#comment-item-${id}{background-color:var(--backgroundColorUpdate);}`,
		)
		.join("\n");
}
