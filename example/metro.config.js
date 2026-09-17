const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const librarySource = path.join(root, 'src');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = getDefaultConfig(__dirname);

// Bundle the library straight from ../src so edits show up with Fast Refresh.
config.watchFolders = [librarySource];
config.resolver.extraNodeModules = {
	'react-native-live-list': librarySource,
};

// The library's own node_modules hold a second copy of react and react-native
// for its tests. Keep them out so every hook resolves to this app's copy.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
	...(Array.isArray(defaultBlockList)
		? defaultBlockList
		: defaultBlockList
			? [defaultBlockList]
			: []),
	new RegExp(`^${escapeRegExp(path.join(root, 'node_modules'))}/.*$`),
];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];

module.exports = config;
