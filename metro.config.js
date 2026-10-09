const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;
// Native CMake temporary directories disappear during builds. Watching them can
// crash Metro's fallback watcher; these are generated artifacts, not JS sources.
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /\/android\/(?:.*\/)?(?:\.cxx|build|\.gradle)\/.*/,
  // Private publication snapshots can contain another package.json with the same name.
  /\/(?:\.local|artifacts|tests)\/.*/,
];
module.exports = config;
