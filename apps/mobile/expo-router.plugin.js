const pluginModule = require('expo-router/plugin/build')

// Expo config plugins expect a function export.
const plugin = pluginModule.default ?? pluginModule

module.exports = plugin
module.exports.default = plugin
