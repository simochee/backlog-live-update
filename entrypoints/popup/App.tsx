import { useState } from "react";
import { VarCategory, VarNumber, VarString, VarUI } from "react-var-ui";
import { suspend } from "suspend-react";
import { type Settings, settingsStorage } from "@/utils/settings";

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
				<VarString label="ID" path="space.id" />
				<VarString label="API Key" path="space.apiKey" />
			</VarCategory>
			<VarCategory label="Preferences">
				<VarNumber
					label="Interval [m]"
					path="interval"
					integer
					min={1}
					showButtons
				/>
			</VarCategory>
		</VarUI>
	);
};
