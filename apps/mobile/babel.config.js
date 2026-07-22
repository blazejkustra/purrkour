module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // typegpu's 'use gpu' shader functions are compiled by this plugin;
    // babel-preset-expo auto-appends react-native-worklets/plugin (reanimated).
    plugins: ["unplugin-typegpu/babel"],
  };
};
