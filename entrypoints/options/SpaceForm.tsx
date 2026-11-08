import { useEffect, useRef, useState } from "react";
import { parseSpaceKeyInput, type SpaceConfig } from "@/utils/settings";
import {
	parseSuggestedSpace,
	type SuggestedSpace,
} from "@/utils/suggested-space";
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
	const keyInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		keyInput.current?.focus();
	}, []);
	const [input, setInput] = useState(suggestion?.key ?? "");
	const [apiKey, setApiKey] = useState("");
	const key = parseSpaceKeyInput(input);
	const knownSpace =
		parseSuggestedSpace(input.includes("://") ? input : `https://${input}`) ??
		(key === suggestion?.key ? suggestion : null);
	const duplicate = spaces.some((space) => space.key === key);
	return (
		<form
			className="add-form"
			aria-labelledby="add-heading"
			onSubmit={(event) => {
				event.preventDefault();
				if (key && !duplicate) onAdd({ key, apiKey, enabled: true });
			}}
		>
			<div className="field">
				<label htmlFor="space-key">Space Key</label>
				<input
					id="space-key"
					ref={keyInput}
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
				{knownSpace && (
					<a
						className="description api-help"
						href={`${knownSpace.origin}/EditApiSettings.action`}
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
		<div className="space-editor">
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
						className="danger"
						type="button"
						onClick={() => setConfirming(true)}
					>
						Remove
					</button>
				)}
			</div>
		</div>
	);
}
