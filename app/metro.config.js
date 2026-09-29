const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  path.resolve(__dirname, '..'),
  path.resolve('C:/Users/HomePC/node_modules'),
];

config.resolver.unstable_enablePackageExports = true;

const encodingNativePath = path.resolve(__dirname, 'node_modules/@solana-mobile/mobile-wallet-adapter-protocol/lib/cjs/encoding.native.js');

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@solana-mobile/mobile-wallet-adapter-protocol/encoding') {
    return {
      type: 'sourceFile',
      filePath: encodingNativePath,
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
