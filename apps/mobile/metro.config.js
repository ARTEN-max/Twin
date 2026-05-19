// Learn more https://docs.expo.dev/guides/customizing-metro
if (!Array.prototype.toReversed) {
  // Metro uses ES2023 array helpers; keep local builds working on older Node.
  Object.defineProperty(Array.prototype, 'toReversed', {
    value() {
      return [...this].reverse();
    },
    writable: true,
    configurable: true,
  });
}

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedPackageRoot = path.resolve(workspaceRoot, 'packages/shared');
const monorepoNodeModules = path.resolve(workspaceRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// Watch the workspace package so Metro can follow pnpm symlinks in both local
// monorepo development and EAS monorepo builds.
config.watchFolders = [workspaceRoot, sharedPackageRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), monorepoNodeModules];

config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

config.resolver.extraNodeModules = {
  'background-recorder': path.resolve(projectRoot, 'modules/background-recorder'),
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix: AppEntry.js does `../../App` which resolves to the wrong directory in monorepo
  if (
    moduleName === '../../App' &&
    context.originModulePath.includes('node_modules/expo/AppEntry')
  ) {
    return {
      filePath: path.resolve(projectRoot, 'App.tsx'),
      type: 'sourceFile',
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

module.exports = config;
