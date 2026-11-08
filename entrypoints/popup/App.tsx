import { use, useState } from "react";
import {
	INTERVAL_OPTIONS,
	type Settings,
	settingsStorage,
} from "@/utils/settings";

// render 内で読み直すと Suspense の再試行ごとに Promise が変わるため、ここで共有する。
const settingsPromise = settingsStorage.getValue();

function formatInterval(seconds: number): string {
	return seconds <= 60 ? `${seconds}s` : `${seconds / 60}m`;
}

export const App = () => {
	const settings = use(settingsPromise);
	const [values, setValues] = useState(settings);
	const [showApiKey, setShowApiKey] = useState(false);
	const [saveError, setSaveError] = useState(false);

	const update = async (inputs: Settings) => {
		setValues(inputs);
		try {
			await settingsStorage.setValue(inputs);
			setSaveError(false);
		} catch {
			setSaveError(true);
		}
	};

	return (
		<main>
			<section aria-labelledby="space-heading">
				<h2 id="space-heading">Space</h2>
				<label htmlFor="space-key">Space Key</label>
				<input
					id="space-key"
					type="text"
					autoComplete="off"
					spellCheck={false}
					value={values.space.key}
					onChange={(event) =>
						update({
							...values,
							space: { ...values.space, key: event.target.value },
						})
					}
				/>
				<label htmlFor="api-key">API Key</label>
				<div className="secret-field">
					<input
						id="api-key"
						type={showApiKey ? "text" : "password"}
						autoComplete="off"
						data-1p-ignore
						data-lpignore="true"
						spellCheck={false}
						autoCapitalize="none"
						value={values.space.apiKey}
						onChange={(event) =>
							update({
								...values,
								space: { ...values.space, apiKey: event.target.value },
							})
						}
					/>
					<button
						type="button"
						aria-controls="api-key"
						aria-label={showApiKey ? "Hide API Key" : "Show API Key"}
						aria-pressed={showApiKey}
						onClick={() => setShowApiKey(!showApiKey)}
					>
						{showApiKey ? "Hide" : "Show"}
					</button>
				</div>
			</section>
			<section aria-labelledby="preferences-heading">
				<h2 id="preferences-heading">Preferences</h2>
				<label htmlFor="interval">Interval</label>
				<select
					id="interval"
					value={values.interval}
					onChange={(event) => {
						const interval = INTERVAL_OPTIONS.find(
							(option) => String(option) === event.target.value,
						);
						if (interval !== undefined) void update({ ...values, interval });
					}}
				>
					{INTERVAL_OPTIONS.map((interval) => (
						<option key={interval} value={interval}>
							{formatInterval(interval)}
						</option>
					))}
				</select>
			</section>
			{saveError && (
				<p role="alert">Could not save settings. Please try again.</p>
			)}
		</main>
	);
};
