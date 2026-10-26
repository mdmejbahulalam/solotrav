// Metro configuration for the npm-workspaces monorepo: lets the app import @solotrav/* packages from ../../packages.
// Packages are mapped explicitly (not via node_modules symlinks) so bundling also works on Windows and in CI.
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const packagesDir = path.join(workspaceRoot, 'packages');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
config.resolver.extraNodeModules = Object.fromEntries(
  fs.readdirSync(packagesDir).filter((d) => fs.existsSync(path.join(packagesDir, d, 'package.json'))).map((d) => [`@solotrav/${d}`, path.join(packagesDir, d)]),
);

module.exports = config;
