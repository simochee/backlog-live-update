import { describe, expect, it } from "vite-plus/test";
import {
	createLiveStateMessage,
	isLiveStateMessage,
} from "./live-state-message";

describe("live-state message の共有契約", () => {
	it.each([
		true,
		false,
	])("生成した active:%s の message を受信側が受け付ける", (active) => {
		const message = createLiveStateMessage(active);
		expect(message).toStrictEqual({ type: "live-state", active });
		expect(isLiveStateMessage(message)).toBe(true);
	});

	it.each([
		null,
		[],
		"live-state",
		{},
		{ type: "other", active: true },
		{ type: "live-state", active: 1 },
		{ type: "live-state" },
	])("契約を満たさない message %j を拒否する", (value) => {
		expect(isLiveStateMessage(value)).toBe(false);
	});

	it("追加の field があっても既知の契約を満たせば受け付ける", () => {
		expect(
			isLiveStateMessage({ type: "live-state", active: false, extra: true }),
		).toBe(true);
	});
});
