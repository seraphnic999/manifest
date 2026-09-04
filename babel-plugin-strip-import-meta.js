// maplibre-gl (an ESM-only package) uses `import.meta.url` to auto-detect
// its worker script's location — meaningless under Metro, which bundles
// even ESM node_modules into non-module wrappers where `import.meta` is a
// hard syntax/runtime error ("Cannot use 'import.meta' outside a module").
// Replacing it with a stand-in object whose `.url` isn't a valid
// "http(s)://..." string makes maplibre-gl's own auto-detection code take
// its documented empty-string fallback path instead of crashing — the app
// then explicitly points it at the real worker file via
// maplibregl.setWorkerUrl() (see components/TripMap.web.tsx), which every
// bundler (Vite, webpack, Metro alike) requires regardless of this fix,
// since none of them make `import.meta.url` resolve to a meaningful
// worker-file location automatically.
module.exports = function stripImportMeta() {
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name === "import" && path.node.property.name === "meta") {
          path.replaceWithSourceString('({ url: "" })');
        }
      },
    },
  };
};
