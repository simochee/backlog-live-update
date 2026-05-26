/**
 * promise を返すコールバックの「完了時刻」を起点に、interval(ミリ秒)ごとに
 * コールバックを実行する polling ユーティリティ。
 *
 * タブ非表示(`document.visibilityState !== "visible"`)の間はタイマーを停止し、
 * 表示へ復帰した時点で前回完了からの経過時間を評価する。実時間ベースで判定するため、
 * 経過が interval 以上なら即時実行、未満なら残り時間だけ待機してから実行する。
 *
 * コールバック実行中(promise pending)は次回をスケジュールせず、完了を待って
 * 再スケジュールするため二重実行は起きない。コールバックが reject してもループは
 * 継続する(エラー処理はコールバック側の責務)。
 *
 * 制約: window フォーカスは判定対象外。別アプリへフォーカスが移ってもタブが表示
 * されていれば継続する。起動時は即時実行せず、最初の実行は interval 経過後となる。
 *
 * @param callback interval ごとに実行する処理。完了(resolve/reject)を起点に次回を計測する
 * @param interval 前回完了から次回実行までの待機時間(ミリ秒)
 * @returns polling を停止するクリーンアップ関数
 */
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
