const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// pnpm workspace: watch the whole monorepo (engine sources + root
// node_modules) and resolve packages from both node_modules roots.
const workspaceRoot = path.resolve(__dirname, "../..");
config.watchFolders = [workspaceRoot];
config.resolver.unstable_enableSymlinks = true;
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];

module.exports = config;
