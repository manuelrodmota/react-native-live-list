import { StatusBar } from 'expo-status-bar';
import { TickerProvider } from 'react-native-live-list';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeparturesBoard } from './src/screens/DeparturesBoard';

export default function App() {
	return (
		<SafeAreaProvider>
			<TickerProvider>
				<StatusBar style="light" />
				<DeparturesBoard />
			</TickerProvider>
		</SafeAreaProvider>
	);
}
