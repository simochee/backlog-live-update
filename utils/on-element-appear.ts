let counter = 0;

/**
 * CSS animation を利用して、セレクタにマッチする要素の DOM 出現を検出する。
 *
 * 対象セレクタへ視覚的に無変化な no-op アニメーションを仕込み、要素が DOM に
 * 挿入された瞬間に発火する `animationstart` イベントを監視する。登録時点で
 * 既にマッチしている要素も style 注入時に一度コールバックされる。
 *
 * 制約: 対象サイト側が `animation: none !important` 等で animation を抑止して
 * いる場合は検出できない。
 *
 * @param selector 監視対象の CSS セレクタ
 * @param callback マッチ要素が出現したときに呼ばれる
 * @returns 監視を解除するクリーンアップ関数
 */
export function onElementAppear(
	selector: string,
	callback: (element: HTMLElement) => void,
): () => void {
	const animationName = `lfb-appear-${++counter}`;

	const style = document.createElement("style");
	style.textContent = `
		@keyframes ${animationName} {
			from { outline-color: transparent; }
			to { outline-color: transparent; }
		}
		${selector} {
			animation: ${animationName} 0.001s;
		}
	`;

	const handler = (event: AnimationEvent) => {
		if (
			event.animationName === animationName &&
			event.target instanceof HTMLElement
		) {
			callback(event.target);
		}
	};

	document.addEventListener("animationstart", handler, true);
	document.head.appendChild(style);

	return () => {
		document.removeEventListener("animationstart", handler, true);
		style.remove();
	};
}
