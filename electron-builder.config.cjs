'use strict';

const os = require('node:os');
const path = require('node:path');
const packageConfig = require('./package.json').build;

module.exports = {
  ...packageConfig,
  directories: {
    ...packageConfig.directories,
    output: process.platform === 'win32'
      ? 'C:\\SmartTrack-release'
      : path.join(os.homedir(), 'SmartTrack-release'),
  },
};
