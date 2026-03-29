// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

// Find the project and workspace directories
// Use realpathSync to resolve any symlinks EAS may create in the build environment
const projectRoot = fs.realpathSync(__dirname);

// Walk up from projectRoot until we find the monorepo root (has packages/shared)
function findMonorepoRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'packages', 'shared'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume 2 levels up
  return path.resolve(startDir, '../..');
}

const monorepoRoot = findMonorepoRoot(projectRoot);
const sharedPackagePath = path.resolve(monorepoRoot, 'packages/shared');
const sharedDistPath = path.resolve(sharedPackagePath, 'dist');

const config = getDefaultConfig(projectRoot);

// 1. Watch the shared dist folder if it exists (gracefully skip if path is wrong in CI)
config.watchFolders = fs.existsSync(sharedDistPath) ? [sharedDistPath] : [];

// 2. Block Metro from accessing packages/shared/src - force it to use dist only
config.resolver.blockList = [
  // Block all source files in packages/shared/src
  new RegExp(`${sharedPackagePath}/src/.*`),
];

// 3. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 4. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

// 4b. Enable package.json "exports" resolution (needed for firebase/auth, firebase/app, etc.)
config.resolver.unstable_enablePackageExports = true;

// 5. Add workspace packages to the resolver - point directly to dist for React Native
const asyncStoragePath = path.resolve(
  monorepoRoot,
  'node_modules/@react-native-async-storage/async-storage'
);
const firebasePath = path.resolve(monorepoRoot, 'node_modules/firebase');
config.resolver.extraNodeModules = {
  '@komuchi/shared': sharedDistPath,
  // Ensure AsyncStorage resolves from root node_modules
  '@react-native-async-storage/async-storage': asyncStoragePath,
  // Ensure Firebase resolves from root node_modules
  firebase: firebasePath,
};

// 6. Custom resolver to ALWAYS use dist for @komuchi/shared
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix monorepo: AppEntry.js at root node_modules does `../../App` which resolves to
  // the monorepo root instead of apps/mobile. Redirect it to the correct App.tsx.
  if (
    moduleName === '../../App' &&
    context.originModulePath.includes('node_modules/expo/AppEntry')
  ) {
    return {
      filePath: path.resolve(projectRoot, 'App.tsx'),
      type: 'sourceFile',
    };
  }

  // Force @komuchi/shared to always resolve to dist/index.cjs (CJS for Metro compatibility)
  if (moduleName === '@komuchi/shared') {
    const distIndex = path.join(sharedDistPath, 'index.cjs');
    if (fs.existsSync(distIndex)) {
      return {
        filePath: distIndex,
        type: 'sourceFile',
      };
    }
  }

  // Force subpath imports to use dist CJS
  if (moduleName.startsWith('@komuchi/shared/')) {
    const subpath = moduleName.replace('@komuchi/shared/', '');
    const distSubpath = path.join(sharedDistPath, subpath, 'index.cjs');
    if (fs.existsSync(distSubpath)) {
      return {
        filePath: distSubpath,
        type: 'sourceFile',
      };
    }
  }

  // Force AsyncStorage to resolve from root node_modules
  if (moduleName === '@react-native-async-storage/async-storage') {
    const asyncStorageIndex = path.join(asyncStoragePath, 'lib/commonjs/index.js');
    if (fs.existsSync(asyncStorageIndex)) {
      return {
        filePath: asyncStorageIndex,
        type: 'sourceFile',
      };
    }
  }

  // Resolve firebase subpath imports (firebase/auth, firebase/app, etc.)
  if (moduleName.startsWith('firebase/')) {
    const subpath = moduleName.replace('firebase/', '');
    const subpathMain = path.join(firebasePath, subpath, 'dist', 'index.cjs.js');
    if (fs.existsSync(subpathMain)) {
      return {
        filePath: subpathMain,
        type: 'sourceFile',
      };
    }
  }
  if (moduleName === 'firebase') {
    const mainEntry = path.join(firebasePath, 'app', 'dist', 'index.cjs.js');
    if (fs.existsSync(mainEntry)) {
      return {
        filePath: mainEntry,
        type: 'sourceFile',
      };
    }
  }

  // Fall back to default resolver
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 7. Add source extensions to help Metro resolve .js imports in ESM modules
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

module.exports = config;
