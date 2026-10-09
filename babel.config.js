module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 依赖 worklets 的 babel 插件；必须放在插件列表最后。
    plugins: ['react-native-worklets/plugin'],
  };
};
