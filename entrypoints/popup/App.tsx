import {
	ActionButton,
	Button,
	defaultTheme,
	Flex,
	Form,
	Heading,
	NumberField,
	Provider,
	Switch,
	TextField,
	View,
} from "@adobe/react-spectrum";
import { useEffect, useState } from "react";
import { safeParse } from "valibot";
import {
	DEFAULT_SETTINGS,
	type Settings,
	SettingsSchema,
	settingsStorage,
} from "@/utils/settings";
import { toValidationErrors } from "@/utils/validation";

export const App = () => {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let ignore = false;
		settingsStorage
			.getValue()
			.then((value) => {
				if (ignore) return;
				setSettings(value);
				setLoaded(true);
			})
			.catch((error) => {
				console.error("[live-for-backlog] failed to load settings:", error);
				if (!ignore) setLoaded(true);
			});
		return () => {
			ignore = true;
		};
	}, []);

	// safeParse 成功時のみ storage へ反映（全体保留方式）。失敗時はエラー表示のまま編集継続。
	const update = (next: Settings) => {
		// next は呼び出し側で完成済みのため functional updater は不要（popup は単一同期操作）
		setSettings(next);
		const result = safeParse(SettingsSchema, next);
		if (result.success) {
			setErrors({});
			settingsStorage.setValue(result.output).catch((error) => {
				console.error("[live-for-backlog] failed to persist settings:", error);
			});
		} else {
			setErrors(toValidationErrors(result.issues));
		}
	};

	const updateSpace = (
		index: number,
		patch: Partial<Settings["spaces"][number]>,
	) => {
		const spaces = settings.spaces.map((space, i) =>
			i === index ? { ...space, ...patch } : space,
		);
		update({ ...settings, spaces });
	};

	if (!loaded) return null;

	return (
		// colorScheme="light": 設計上 light 固定（OS のダークモード設定に追従しない意図）
		<Provider theme={defaultTheme} colorScheme="light">
			<View padding="size-200">
				<Form validationBehavior="aria" validationErrors={errors}>
					<Switch
						isSelected={settings.globalEnabled}
						onChange={(value) => update({ ...settings, globalEnabled: value })}
					>
						全機能を有効化
					</Switch>

					<NumberField
						label="更新間隔(分)"
						name="intervalMinutes"
						minValue={1}
						maxValue={30}
						step={1}
						width="100%"
						value={settings.intervalMinutes}
						onChange={(value) => {
							if (Number.isNaN(value)) return;
							update({ ...settings, intervalMinutes: value });
						}}
					/>

					<Heading level={3}>スペース</Heading>
					{/* View でラップ: Form の children 型が配列を直接受け付けないため (TS2739) */}
					<View>
						<Flex direction="column" gap="size-200">
							{settings.spaces.map((space, index) => (
								// biome-ignore-start lint/suspicious/noArrayIndexKey: 行は index key（controlled value のため再順序は発生しない）
								<View
									key={index}
									borderWidth="thin"
									borderColor="dark"
									borderRadius="medium"
									padding="size-150"
								>
									<Flex direction="column" gap="size-150">
										<TextField
											label="Space ID"
											name={`spaces.${index}.id`}
											isRequired
											width="100%"
											value={space.id}
											onChange={(value) => updateSpace(index, { id: value })}
										/>
										<TextField
											label="API Key"
											type="password"
											name={`spaces.${index}.apiKey`}
											isRequired
											width="100%"
											value={space.apiKey}
											onChange={(value) =>
												updateSpace(index, { apiKey: value })
											}
										/>
										<Flex justifyContent="space-between" alignItems="center">
											<Switch
												isSelected={space.enabled}
												onChange={(value) =>
													updateSpace(index, { enabled: value })
												}
											>
												有効
											</Switch>
											<ActionButton
												aria-label="このスペースを削除"
												onPress={() =>
													update({
														...settings,
														spaces: settings.spaces.filter(
															(_, i) => i !== index,
														),
													})
												}
											>
												✕
											</ActionButton>
										</Flex>
									</Flex>
								</View>
								// biome-ignore-end lint/suspicious/noArrayIndexKey: 行は index key（controlled value のため再順序は発生しない）
							))}
						</Flex>
					</View>

					<Button
						variant="accent"
						width="100%"
						onPress={() =>
							update({
								...settings,
								spaces: [
									...settings.spaces,
									{ id: "", apiKey: "", enabled: true },
								],
							})
						}
					>
						スペースを追加
					</Button>
				</Form>
			</View>
		</Provider>
	);
};
