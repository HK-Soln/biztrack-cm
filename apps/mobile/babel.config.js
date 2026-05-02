module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      // Must be listed last — transforms worklet functions for Reanimated
      'react-native-reanimated/plugin',
    ]
  };
};
