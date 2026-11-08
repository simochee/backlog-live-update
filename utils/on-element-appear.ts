let counter = 0;

export function onElementAppear(
	selector: string,
	callback: (element: HTMLElement) => void,
): () => void {
	const animationName = `blu-appear-${++counter}`;

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
