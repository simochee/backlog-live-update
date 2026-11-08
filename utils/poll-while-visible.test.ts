import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vite-plus/test";
import { pollWhileVisible } from "./poll-while-visible";

function setVisibility(state: "visible" | "hidden") {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => state,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}

describe("pollWhileVisible", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setVisibility("visible");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("起動時は実行せず、interval 経過後に callback を実行する", async () => {
		const callback = vi.fn();
		const stop = pollWhileVisible(callback, 1000);

		expect(callback).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);
		expect(callback).toHaveBeenCalledTimes(1);

		stop();
	});

	it("hidden の間はタイマーが進まず callback を実行しない", async () => {
		const callback = vi.fn();
		const stop = pollWhileVisible(callback, 1000);

		setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(5000);
		expect(callback).not.toHaveBeenCalled();

		stop();
	});

	it("callback 実行中に visibility が変化しても二重実行しない", async () => {
		let resolve!: () => void;
		const callback = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		const stop = pollWhileVisible(callback, 1000);

		await vi.advanceTimersByTimeAsync(1000);
		expect(callback).toHaveBeenCalledTimes(1);

		setVisibility("hidden");
		setVisibility("visible");
		await vi.advanceTimersByTimeAsync(0);
		expect(callback).toHaveBeenCalledTimes(1);

		resolve();
		await vi.advanceTimersByTimeAsync(1000);
		expect(callback).toHaveBeenCalledTimes(2);

		stop();
	});

	it("復帰時、interval 未満の経過なら残り時間だけ待つ", async () => {
		const callback = vi.fn();
		const stop = pollWhileVisible(callback, 1000);

		await vi.advanceTimersByTimeAsync(400);
		setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(300);
		expect(callback).not.toHaveBeenCalled();

		setVisibility("visible");
		await vi.advanceTimersByTimeAsync(299);
		expect(callback).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(callback).toHaveBeenCalledTimes(1);

		stop();
	});

	it("復帰時、interval 以上経過していれば即時実行する", async () => {
		const callback = vi.fn();
		const stop = pollWhileVisible(callback, 1000);

		setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(2000);
		expect(callback).not.toHaveBeenCalled();

		setVisibility("visible");
		await vi.advanceTimersByTimeAsync(0);
		expect(callback).toHaveBeenCalledTimes(1);

		stop();
	});

	it("interval は前回 callback の完了時刻を起点に計測する", async () => {
		let resolve!: () => void;
		const callback = vi.fn(
			() =>
				new Promise<void>((r) => {
					resolve = r;
				}),
		);
		const stop = pollWhileVisible(callback, 1000);

		await vi.advanceTimersByTimeAsync(1000);
		expect(callback).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		expect(callback).toHaveBeenCalledTimes(1);

		resolve();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(999);
		expect(callback).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(callback).toHaveBeenCalledTimes(2);

		stop();
	});

	it("cleanup 後はタイマーも visibilitychange も停止する", async () => {
		const callback = vi.fn();
		const stop = pollWhileVisible(callback, 1000);

		stop();
		await vi.advanceTimersByTimeAsync(5000);
		expect(callback).not.toHaveBeenCalled();

		setVisibility("hidden");
		setVisibility("visible");
		await vi.advanceTimersByTimeAsync(5000);
		expect(callback).not.toHaveBeenCalled();
	});
});
