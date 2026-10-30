'use strict';

const electron = require('electron');
const remote = require('@electron/remote');

// Compatibilidad temporal para bibliotecas antiguas.
if (!electron.remote) {
  electron.remote = remote;
}

module.exports = remote;
