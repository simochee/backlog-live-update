import { useState } from "react";

export function ApiKeyField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [visible, setVisible] = useState(false);
	return (
		<div className="field">
			<label htmlFor="api-key">API key</label>
			<div className="secret-field">
				<input
					id="api-key"
					type={visible ? "text" : "password"}
					autoComplete="off"
					data-1p-ignore
					data-lpignore="true"
					spellCheck={false}
					autoCapitalize="none"
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				<button
					type="button"
					aria-controls="api-key"
					aria-label={visible ? "Hide API Key" : "Show API Key"}
					aria-pressed={visible}
					onClick={() => setVisible(!visible)}
				>
					{visible ? "Hide" : "Show"}
				</button>
			</div>
		</div>
	);
}
