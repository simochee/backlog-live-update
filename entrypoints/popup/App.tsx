import { clear, suspend } from "suspend-react";
import { settingsStorage } from "@/utils/settings";

export const App = () => {
	const settings = suspend(() => settingsStorage.getValue(), ["settings"]);

	return null;
};
