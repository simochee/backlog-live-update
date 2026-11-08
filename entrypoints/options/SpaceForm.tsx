import { useState } from "react";
import { parseSpaceKeyInput, type SpaceConfig } from "@/utils/settings";
import type { SuggestedSpace } from "@/utils/suggested-space";
import { ApiKeyField } from "./ApiKeyField";

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
			className="card add-form"
			onSubmit={(event) => {
				event.preventDefault();
				if (key && !duplicate) onAdd({ key, apiKey, enabled: true });
			}}
		>
			<div className="field">
				<label htmlFor="space-key">Space Key</label>
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
					Enter the space key, or paste a URL of your Backlog space.
				</p>
				{duplicate && (
					<p id="space-error" role="alert">
						This space is already added
					</p>
				)}
			</div>
			<div>
				<ApiKeyField value={apiKey} onChange={setApiKey} />
				{suggestion && key === suggestion.key && (
					<a
						className="description api-help"
						href={`${suggestion.origin}/EditApiSettings.action`}
						target="_blank"
						rel="noreferrer"
					>
						Open API settings
					</a>
				)}
			</div>
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
		<div className="card row-card">
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
