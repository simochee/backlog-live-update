import { use, useEffect, useRef, useState } from "react";
import {
	INTERVAL_OPTIONS,
	parseSettings,
	parseSpaceKeyInput,
	type Settings,
	type SpaceConfig,
	settingsStorage,
} from "@/utils/settings";
import { SpaceDetail, SpaceForm, type SuggestedSpace } from "./SpaceForm";

// render 内で読み直すと Suspense の再試行ごとに Promise が変わるため、ここで共有する。
const settingsPromise = settingsStorage.getValue();
type Page =
	| { kind: "main" }
	| { kind: "add"; suggestion?: SuggestedSpace }
	| { kind: "detail"; key: string };

function formatInterval(seconds: number): string {
	return seconds <= 60 ? `${seconds}s` : `${seconds / 60}m`;
}

export const App = () => {
	const settings = use(settingsPromise);
	const [values, setValues] = useState(() => parseSettings(settings));
	const [page, setPage] = useState<Page>({ kind: "main" });
	const [suggestion, setSuggestion] = useState<SuggestedSpace>();
	const [saveError, setSaveError] = useState(false);
	const heading = useRef<HTMLHeadingElement>(null);
	const main = useRef<HTMLElement>(null);
	const returnFocus = useRef<string | undefined>(undefined);
	const navigated = useRef(false);
	useEffect(() => {
		if (!navigated.current) return;
		const opener =
			page.kind === "main"
				? [
						...(main.current?.querySelectorAll<HTMLButtonElement>(
							"[data-focus-key]",
						) ?? []),
					].find((button) => button.dataset.focusKey === returnFocus.current)
				: undefined;
		(opener ?? heading.current)?.focus({ preventScroll: true });
	}, [page]);
	const navigate = (next: Page, focusKey: string) => {
		returnFocus.current = focusKey;
		navigated.current = true;
		setPage(next);
	};
	useEffect(() => {
		let active = true;
		void browser.tabs
			.query({ active: true, currentWindow: true })
			.then(([tab]) => {
				if (!active || !tab?.url) return;
				const key = parseSpaceKeyInput(tab.url);
				if (key) setSuggestion({ key, origin: new URL(tab.url).origin });
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);
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
	const goBack = () => setPage({ kind: "main" });
	const detail =
		page.kind === "detail"
			? values.spaces.find((space) => space.key === page.key)
			: undefined;
	return (
		<main ref={main}>
			<header>
				{page.kind !== "main" && (
					<button
						className="back"
						type="button"
						aria-label="Back"
						onClick={goBack}
					>
						←
					</button>
				)}
				<h1 ref={heading} tabIndex={-1}>
					{page.kind === "main"
						? "Live for Backlog"
						: page.kind === "add"
							? "Add space"
							: page.key}
				</h1>
			</header>
			<div className="page">
				{page.kind === "main" && (
					<>
						<section aria-labelledby="spaces-heading">
							<h2 id="spaces-heading">Spaces</h2>
							<div className="card row-card">
								{suggestion &&
									!values.spaces.some(
										(space) => space.key === suggestion.key,
									) && (
										<button
											className="row row-button suggestion"
											type="button"
											data-focus-key="suggestion"
											onClick={() =>
												navigate({ kind: "add", suggestion }, "suggestion")
											}
										>
											<span aria-hidden="true">＋</span>
											<span>Add {suggestion.key}</span>
											<span className="chevron" aria-hidden="true">
												›
											</span>
										</button>
									)}
								{values.spaces.length === 0 && (
									<div className="row muted">No spaces added</div>
								)}
								{values.spaces.map((space) => (
									<div className="row space-row" key={space.key}>
										<button
											className="space-link"
											type="button"
											data-focus-key={`space:${space.key}`}
											onClick={() =>
												navigate(
													{ kind: "detail", key: space.key },
													`space:${space.key}`,
												)
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
											<span className="chevron" aria-hidden="true">
												›
											</span>
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
								))}
								<button
									className="row row-button"
									type="button"
									data-focus-key="add-space"
									onClick={() => navigate({ kind: "add" }, "add-space")}
								>
									<span aria-hidden="true">＋</span>
									<span>Add space</span>
									<span className="chevron" aria-hidden="true">
										›
									</span>
								</button>
							</div>
						</section>
						<section aria-labelledby="preferences-heading">
							<h2 id="preferences-heading">Preferences</h2>
							<div className="card row-card">
								<div className="row interval-row">
									<label className="row-text" htmlFor="interval">
										<span>Polling interval</span>
										<span id="interval-help" className="description">
											How often open issues are checked
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
											if (interval !== undefined)
												update({ ...values, interval });
										}}
									>
										{INTERVAL_OPTIONS.map((interval) => (
											<option key={interval} value={interval}>
												{formatInterval(interval)}
											</option>
										))}
									</select>
								</div>
							</div>
						</section>
					</>
				)}
				{page.kind === "add" && (
					<SpaceForm
						spaces={values.spaces}
						suggestion={page.suggestion}
						onCancel={goBack}
						onAdd={(space) => {
							update({ ...values, spaces: [...values.spaces, space] });
							goBack();
						}}
					/>
				)}
				{detail && (
					<SpaceDetail
						key={detail.key}
						space={detail}
						onChange={updateSpace}
						onRemove={() => {
							update({
								...values,
								spaces: values.spaces.filter(
									(space) => space.key !== detail.key,
								),
							});
							goBack();
						}}
					/>
				)}
				{saveError && (
					<p role="alert">Could not save settings. Please try again.</p>
				)}
			</div>
		</main>
	);
};
