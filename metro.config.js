const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite compiled to WebAssembly; Metro must treat
// .wasm files as bundleable assets.
config.resolver.assetExts.push('wasm');

module.exports = config;
