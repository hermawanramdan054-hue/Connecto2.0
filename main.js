const { app, BrowserWindow } = require('electron');

// Simpan laporan di folder data pengguna agar installer tidak membutuhkan izin tulis.
process.env.CONNECTO_DATA_DIR = app.getPath('userData');
const { serverReady } = require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Connecto",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  serverReady
    .then((port) => mainWindow.loadURL(`http://127.0.0.1:${port}`))
    .catch((err) => {
      console.error('Server lokal gagal dimulai:', err);
      mainWindow.loadURL('about:blank');
    });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});