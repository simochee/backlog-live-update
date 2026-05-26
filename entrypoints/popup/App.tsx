import { Button, defaultTheme, Provider, View } from "@adobe/react-spectrum";

export const App = () => {
	return (
		<Provider theme={defaultTheme} colorScheme="light">
			<View padding="size-200" minWidth="size-3600">
				<Button variant="accent" onPress={() => {}}>
					live-for-backlog
				</Button>
			</View>
		</Provider>
	);
};
