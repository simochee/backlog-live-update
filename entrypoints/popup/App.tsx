import { useState } from "react";

export const App = () => {
	const [count, setCount] = useState(0);

	return (
		<main className="popup">
			<h1>live-for-backlog</h1>
			<button type="button" onClick={() => setCount((c) => c + 1)}>
				count is {count}
			</button>
		</main>
	);
};
