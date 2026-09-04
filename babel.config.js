module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // @babel/plugin-transform-class-static-block: maplibre-gl's web bundle
    // uses static class blocks (a modern JS feature), which the default
    // Metro/babel-preset-expo pipeline for this SDK doesn't transform.
    plugins: [
      "react-native-reanimated/plugin",
      "@babel/plugin-transform-class-static-block",
      // maplibre-gl uses `import.meta.url`, invalid under Metro's bundling
      // — see babel-plugin-strip-import-meta.js for the full explanation.
      "./babel-plugin-strip-import-meta.js",
    ],
  };
};
