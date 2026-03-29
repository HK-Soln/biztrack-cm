import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:3000')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(() => {
  createWindow()

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
