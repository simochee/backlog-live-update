export function pollWhileVisible(
	callback: () => void | Promise<void>,
	interval: number,
): () => void {
	let lastFinished = performance.now();
	let timerId: ReturnType<typeof setTimeout> | undefined;
	let running = false;
	let disposed = false;

	const clear = () => {
		if (timerId !== undefined) {
			clearTimeout(timerId);
			timerId = undefined;
		}
	};

	const schedule = () => {
		if (disposed || running) return;
		if (document.visibilityState !== "visible") return;
		clear();
		const remaining = lastFinished + interval - performance.now();
		timerId = setTimeout(
			() => {
				void run();
			},
			Math.max(remaining, 0),
		);
	};

	const run = async () => {
		if (disposed || running) return;
		clear();
		running = true;
		try {
			await callback();
		} finally {
			running = false;
			lastFinished = performance.now();
			if (!disposed) schedule();
		}
	};

	const handleVisibilityChange = () => {
		if (document.visibilityState === "visible") {
			schedule();
		} else {
			clear();
		}
	};

	document.addEventListener("visibilitychange", handleVisibilityChange);
	schedule();

	return () => {
		disposed = true;
		clear();
		document.removeEventListener("visibilitychange", handleVisibilityChange);
	};
}
