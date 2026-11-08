const STYLE_ELEMENT_ID = "blu-comment-highlight";

// is_target class は React の再描画で剥がれるため、安定した要素 id を CSS から狙う。
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

	// rule の追記だけでは重複と無制限な増加を招くため、既知 id から毎回再生成する。
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
