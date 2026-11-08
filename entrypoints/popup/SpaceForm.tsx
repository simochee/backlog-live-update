import { useState } from "react";
import { parseSpaceKeyInput, type SpaceConfig } from "@/utils/settings";
import { ApiKeyField } from "./ApiKeyField";

export type SuggestedSpace = { key: string; origin: string };

export function SpaceForm({
	spaces,
	suggestion,
	onAdd,
	onCancel,
}: {
	spaces: SpaceConfig[];
	suggestion?: SuggestedSpace;
	onAdd: (space: SpaceConfig) => void;
	onCancel: () => void;
}) {
	const [input, setInput] = useState(suggestion?.key ?? "");
	const [apiKey, setApiKey] = useState("");
	const key = parseSpaceKeyInput(input);
	const duplicate = spaces.some((space) => space.key === key);
	return (
		<form
			className="card form-card"
			onSubmit={(event) => {
				event.preventDefault();
				if (key && !duplicate) onAdd({ key, apiKey, enabled: true });
			}}
		>
			<div className="field">
				<label htmlFor="space-key">Space</label>
				<input
					id="space-key"
					autoComplete="off"
					spellCheck={false}
					autoCapitalize="none"
					value={input}
					onChange={(event) => setInput(event.target.value)}
					aria-describedby={duplicate ? "space-help space-error" : "space-help"}
					aria-invalid={duplicate}
				/>
				<p className="description" id="space-help">
					Enter a space key, Backlog hostname, or URL.
				</p>
				{duplicate && (
					<p id="space-error" role="alert">
						This space is already added
					</p>
				)}
			</div>
			<ApiKeyField value={apiKey} onChange={setApiKey} />
			{suggestion && key === suggestion.key && (
				<a
					href={`${suggestion.origin}/EditApiSettings.action`}
					target="_blank"
					rel="noreferrer"
				>
					Get an API key
				</a>
			)}
			<div className="actions">
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
				<button className="primary" type="submit" disabled={!key || duplicate}>
					Add
				</button>
			</div>
		</form>
	);
}

export function SpaceDetail({
	space,
	onChange,
	onRemove,
}: {
	space: SpaceConfig;
	onChange: (space: SpaceConfig) => void;
	onRemove: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	return (
		<div className="card">
			<label className="row" htmlFor="live-updates">
				<span>Live updates</span>
				<input
					id="live-updates"
					className="switch"
					type="checkbox"
					role="switch"
					aria-checked={space.enabled}
					checked={space.enabled}
					onChange={(event) =>
						onChange({ ...space, enabled: event.target.checked })
					}
				/>
			</label>
			<div className="form-card">
				<ApiKeyField
					value={space.apiKey}
					onChange={(apiKey) => onChange({ ...space, apiKey })}
				/>
			</div>
			<div className="danger-row">
				{confirming ? (
					<>
						<p>Remove {space.key}?</p>
						<div className="actions">
							<button type="button" onClick={() => setConfirming(false)}>
								Cancel
							</button>
							<button className="danger" type="button" onClick={onRemove}>
								Remove
							</button>
						</div>
					</>
				) : (
					<button
						className="danger row row-button"
						type="button"
						onClick={() => setConfirming(true)}
					>
						Remove space
					</button>
				)}
			</div>
		</div>
	);
}
