import { useId, useState } from "react";

export function ApiKeyField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const [visible, setVisible] = useState(false);
	return (
		<div className="field">
			<label htmlFor={id}>API Key</label>
			<div className="secret-field">
				<input
					id={id}
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
					aria-controls={id}
					aria-label="Show API Key"
					aria-pressed={visible}
					onClick={() => setVisible(!visible)}
				>
					{visible ? "Hide" : "Show"}
				</button>
			</div>
		</div>
	);
}
