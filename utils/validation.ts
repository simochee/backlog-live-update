import type { BaseIssue } from "valibot";

/**
 * valibot の issues を react-spectrum `<Form validationErrors>` 用の
 * `{ [fieldName]: message }` へ変換する。
 * path は `spaces.0.id` の dot 形式。先勝ち（同一 field の最初の issue を採用）。
 */
export function toValidationErrors(
	issues: readonly BaseIssue<unknown>[],
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const name = issue.path?.map((segment) => segment.key).join(".") ?? "";
		if (name && !(name in errors)) {
			errors[name] = issue.message;
		}
	}
	return errors;
}
