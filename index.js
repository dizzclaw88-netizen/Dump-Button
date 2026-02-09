const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

const { logger } = require('./logger');
const { getSettings } = require('./settings');

const { PromiseRPCProtocol } = require('promise.rpc');
const { nms } = require('./rtmp_relay');
const { StreamController } = require('./stream_controller');

nms.run();

const controller = new StreamController(getSettings);

const streamActions = {
  async startLive() {
    await controller.refreshProbe();
    return controller.startLive();
  },
  async stopStream() {
    return controller.stopStream();
  },
  async dumpStream() {
    return controller.dumpStream();
  },
  async dumpOn() {
    return controller.dumpOn();
  },
  async resumeLive() {
    return controller.resumeLive();
  },
  async refreshProbe() {
    return controller.refreshProbe();
  },
  async status() {
    return controller.status();
  }
};


let mainWindow;
/* NOTE: this is only designed to one renderer, and will break with multiple  */
const apiServer = new PromiseRPCProtocol(streamActions);

apiServer.onDispatch = (message) => {
  mainWindow.webContents.send('rpc', message);
};
ipcMain.on('rpc', function(event, arg) {
  console.log({args: arguments})
  apiServer.dispatch(arg);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}


app.on('ready', createWindow);


app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
