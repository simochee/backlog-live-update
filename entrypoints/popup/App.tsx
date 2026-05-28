import { useState } from "react";
import { VarCategory, VarSelect, VarString, VarUI } from "react-var-ui";
import { suspend } from "suspend-react";
import { type Settings, settingsStorage } from "@/utils/settings";

const INTERVAL_SELECT_OPTIONS = [
	{ key: 15, label: "15s", value: 15 },
	{ key: 30, label: "30s", value: 30 },
	{ key: 60, label: "60s", value: 60 },
	{ key: 300, label: "5m", value: 300 },
	{ key: 600, label: "10m", value: 600 },
];

export const App = () => {
	const settings = suspend(() => settingsStorage.getValue(), ["settings"]);

	const [values, setValues] = useState(settings);

	const update = async (inputs: Settings) => {
		setValues(inputs);

		await settingsStorage.setValue(inputs);
	};

	return (
		<VarUI onChange={update} values={values}>
			<VarCategory label="Space">
				<VarString label="Key" path="space.key" />
				<VarString label="API Key" path="space.apiKey" />
			</VarCategory>
			<VarCategory label="Preferences">
				<VarSelect
					label="Interval"
					path="interval"
					options={INTERVAL_SELECT_OPTIONS}
				/>
			</VarCategory>
		</VarUI>
	);
};
