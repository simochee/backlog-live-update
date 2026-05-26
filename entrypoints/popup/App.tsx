import { Form } from "@rjsf/daisyui";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { useEffect, useState } from "react";
import { safeParse } from "valibot";
import {
	DEFAULT_SETTINGS,
	type Settings,
	SettingsSchema,
	settingsJsonSchema,
	settingsStorage,
} from "@/utils/settings";

const uiSchema: UiSchema = {
	"ui:submitButtonOptions": { norender: true },
	spaces: {
		items: {
			apiKey: {
				"ui:widget": "password",
			},
		},
	},
};

export const App = () => {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let ignore = false;
		settingsStorage
			.getValue()
			.then((value) => {
				if (ignore) return;
				setSettings(value);
				setLoaded(true);
			})
			.catch((error) => {
				console.error("[live-for-backlog] failed to load settings:", error);
				if (!ignore) setLoaded(true);
			});
		return () => {
			ignore = true;
		};
	}, []);

	// safeParse 成功時のみ storage へ反映（全体保留方式）。検証エラー表示は RJSF が担当。
	const update = (formData: Settings | undefined) => {
		if (!formData) return;
		setSettings(formData);
		const result = safeParse(SettingsSchema, formData);
		if (result.success) {
			settingsStorage.setValue(result.output).catch((error) => {
				console.error("[live-for-backlog] failed to persist settings:", error);
			});
		}
	};

	if (!loaded) return null;

	return (
		<div className="text-sm">
			{/* @valibot/to-json-schema の JsonSchema を RJSFSchema にキャスト（runtime 形状は互換） */}
			<Form
				schema={settingsJsonSchema as RJSFSchema}
				uiSchema={uiSchema}
				validator={validator}
				formData={settings}
				liveValidate="onChange"
				onChange={({ formData }) => update(formData)}
			/>
		</div>
	);
};
