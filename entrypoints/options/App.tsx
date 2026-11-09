import { use, useEffect, useRef, useState } from "react";
import {
	INTERVAL_OPTIONS,
	parseSettings,
	type Settings,
	type SpaceConfig,
	settingsStorage,
} from "@/utils/settings";
import { SpaceDetail, SpaceForm } from "./SpaceForm";

// render 内で読み直すと Suspense の再試行ごとに Promise が変わるため、ここで共有する。
const settingsPromise = settingsStorage.getValue();
function formatInterval(seconds: number): string {
	return seconds <= 60 ? `${seconds}s` : `${seconds / 60}m`;
}

export const App = () => {
	const settings = use(settingsPromise);
	const [values, setValues] = useState(() => parseSettings(settings));
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const addButton = useRef<HTMLButtonElement>(null);
	const restoreAddFocus = useRef(false);
	useEffect(() => {
		if (!adding && restoreAddFocus.current) {
			addButton.current?.focus();
			restoreAddFocus.current = false;
		}
	});
	const openAdd = () => {
		setExpandedKey(null);
		setAdding(true);
	};
	const closeAdd = () => {
		restoreAddFocus.current = true;
		setAdding(false);
	};
	const update = async (inputs: Settings) => {
		setValues(inputs);
		try {
			await settingsStorage.setValue(inputs);
			setSaveError(false);
		} catch {
			setSaveError(true);
		}
	};
	const updateSpace = (next: SpaceConfig) =>
		update({
			...values,
			spaces: values.spaces.map((space) =>
				space.key === next.key ? next : space,
			),
		});
	return (
		<main>
			<h1 className="visually-hidden">Backlog Live Update</h1>
			<section aria-labelledby="spaces-heading">
				<h2 id="spaces-heading">Spaces</h2>
				{values.spaces.length === 0 && (
					<div className="row muted">No spaces added</div>
				)}
				{values.spaces.map((space) => (
					<div className="space-item" key={space.key}>
						<div className="row space-row">
							<button
								className="space-link"
								type="button"
								aria-expanded={expandedKey === space.key}
								aria-controls={`space-editor-${space.key}`}
								onClick={() =>
									setExpandedKey(expandedKey === space.key ? null : space.key)
								}
							>
								<span className="row-text">
									<span>{space.key}</span>
									<span className="description">
										{!space.enabled
											? "Paused"
											: !space.apiKey
												? "API Key not set"
												: "Enabled"}
									</span>
								</span>
								<svg
									className="expand-icon"
									viewBox="0 0 24 24"
									width="20"
									height="20"
									aria-hidden="true"
								>
									<path d="M7 10l5 5 5-5" />
								</svg>
							</button>
							<input
								className="switch"
								type="checkbox"
								role="switch"
								aria-checked={space.enabled}
								aria-label={`Live updates for ${space.key}`}
								checked={space.enabled}
								onChange={(event) =>
									updateSpace({ ...space, enabled: event.target.checked })
								}
							/>
						</div>
						<section
							id={`space-editor-${space.key}`}
							aria-label={`Edit ${space.key}`}
							hidden={expandedKey !== space.key}
						>
							{expandedKey === space.key && (
								<SpaceDetail
									space={space}
									onChange={updateSpace}
									onRemove={() => {
										update({
											...values,
											spaces: values.spaces.filter(
												(entry) => entry.key !== space.key,
											),
										});
										restoreAddFocus.current = true;
										setAdding(false);
										setExpandedKey(null);
									}}
								/>
							)}
						</section>
					</div>
				))}
				{adding ? (
					<div className="add-item">
						<div className="row add-heading" id="add-heading">
							Add space
						</div>
						<SpaceForm
							spaces={values.spaces}
							onCancel={closeAdd}
							onAdd={(space) => {
								update({ ...values, spaces: [...values.spaces, space] });
								closeAdd();
							}}
						/>
					</div>
				) : (
					<div className="row add-row">
						<button ref={addButton} type="button" onClick={openAdd}>
							Add space
						</button>
					</div>
				)}
			</section>
			<section aria-labelledby="preferences-heading">
				<h2 id="preferences-heading">Preferences</h2>
				<div className="row interval-row">
					<label className="row-text" htmlFor="interval">
						<span>Polling interval</span>
						<span id="interval-help" className="description">
							How often open issues and pull requests are checked
						</span>
					</label>
					<select
						id="interval"
						aria-describedby="interval-help"
						value={values.interval}
						onChange={(event) => {
							const interval = INTERVAL_OPTIONS.find(
								(option) => String(option) === event.target.value,
							);
							if (interval !== undefined) update({ ...values, interval });
						}}
					>
						{INTERVAL_OPTIONS.map((interval) => (
							<option key={interval} value={interval}>
								{formatInterval(interval)}
							</option>
						))}
					</select>
				</div>
			</section>
			{saveError && (
				<p className="save-error" role="alert">
					Could not save settings. Please try again.
				</p>
			)}
		</main>
	);
};
