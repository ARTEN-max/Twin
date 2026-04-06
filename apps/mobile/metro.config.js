// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;

// @komuchi/shared is vendored inside apps/mobile/vendor-shared for EAS compatibility.
// EAS copies only apps/mobile/ to the build environment, so relative paths to the
// monorepo root don't work there. The vendored dist is always available.
// For local dev: also check the monorepo packages path as a fallback.
const vendoredSharedDist = path.resolve(projectRoot, 'vendor-shared');
const monorepoSharedDist = path.resolve(projectRoot, '../../packages/shared/dist');
const sharedDistPath = fs.existsSync(vendoredSharedDist) ? vendoredSharedDist : monorepoSharedDist;

// Root node_modules exists in local monorepo dev but not in EAS
const monorepoNodeModules = path.resolve(projectRoot, '../../node_modules');

const config = getDefaultConfig(projectRoot);

// Watch the shared dist folder so Metro can serve its files
config.watchFolders = fs.existsSync(sharedDistPath) ? [sharedDistPath] : [];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  ...(fs.existsSync(monorepoNodeModules) ? [monorepoNodeModules] : []),
];

config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

config.resolver.extraNodeModules = {
  '@komuchi/shared': sharedDistPath,
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

  // Force @komuchi/shared to resolve to the vendored CJS dist
  if (moduleName === '@komuchi/shared') {
    const distIndex = path.join(sharedDistPath, 'index.cjs');
    if (fs.existsSync(distIndex)) {
      return { filePath: distIndex, type: 'sourceFile' };
    }
  }

  if (moduleName.startsWith('@komuchi/shared/')) {
    const subpath = moduleName.replace('@komuchi/shared/', '');
    const distSubpath = path.join(sharedDistPath, subpath, 'index.cjs');
    if (fs.existsSync(distSubpath)) {
      return { filePath: distSubpath, type: 'sourceFile' };
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

module.exports = config;
