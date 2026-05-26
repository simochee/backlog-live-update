import { safeParse } from "valibot";
import { describe, expect, it } from "vitest";
import { SettingsSchema } from "./settings";
import { toValidationErrors } from "./validation";

describe("toValidationErrors", () => {
	it("maps interval error to its field name", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 0,
			spaces: [],
		});
		if (result.success) throw new Error("expected failure");
		const errors = toValidationErrors(result.issues);
		expect(errors.intervalMinutes).toBeTruthy();
	});

	it("maps nested space error with dot path", () => {
		const result = safeParse(SettingsSchema, {
			globalEnabled: true,
			intervalMinutes: 1,
			spaces: [{ id: "", apiKey: "key", enabled: true }],
		});
		if (result.success) throw new Error("expected failure");
		const errors = toValidationErrors(result.issues);
		expect(errors["spaces.0.id"]).toBeTruthy();
	});
});
