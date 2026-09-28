const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  path.resolve(__dirname, '..'),
  path.resolve('C:/Users/HomePC/node_modules'),
];

module.exports = config;
