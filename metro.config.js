const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const shim = path.resolve(__dirname, 'src/shims/react-router-dom.tsx');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-router-dom') return { type: 'sourceFile', filePath: shim };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
