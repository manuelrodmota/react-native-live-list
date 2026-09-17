import { Platform } from 'react-native';

export const colors = {
	background: '#05080F',
	panel: '#0B1220',
	row: '#0B1220',
	rowFlash: '#2A2410',
	border: '#1E293B',
	amber: '#FFB300',
	white: '#F8FAFC',
	muted: '#94A3B8',
	dim: '#64748B',
	green: '#22C55E',
	blue: '#38BDF8',
	red: '#EF4444',
	grey: '#475569',
} as const;

export const monospace = Platform.select({
	ios: 'Menlo',
	android: 'monospace',
	default: 'monospace',
});
