import { app, BrowserWindow, Menu, nativeTheme, screen, shell } from 'electron'
import { appendFileSync } from 'fs'
import { join } from 'path'
import { cleanupStale, stopLocalSync } from './ai/llama'
import { ensureDefaultAccount } from './auth'
import { flush, openDb } from './db'
import { recoverOnStartup } from './grading/queue'
import { registerIpc } from './ipc'
import { paths } from './paths'

const isDev = !app.isPackaged
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

function log(msg: string): void {
  try {
    appendFileSync(join(paths.logs, 'app.log'), `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    /* bỏ qua */
  }
}

process.on('uncaughtException', (e) => log('uncaughtException: ' + (e?.stack ?? e)))
process.on('unhandledRejection', (e: any) => log('unhandledRejection: ' + (e?.stack ?? e)))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
}

// Thanh tiêu đề Windows chuyển sang dark mode (DWM immersive dark mode)
nativeTheme.themeSource = 'dark'
if (isWin) app.setAppUserModelId('com.masterscoring.app')

function createWindow(): void {
  const area = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    width: Math.min(1440, Math.max(1024, Math.round(area.width * 0.85))),
    height: Math.min(900, Math.max(600, Math.round(area.height * 0.88))),
    minWidth: 1024,
    minHeight: 600,
    show: false,
    title: 'Master Scoring',
    backgroundColor: '#0B0F14',
    icon: isDev ? join(app.getAppPath(), 'build', 'icon.png') : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isWin ? { color: '#111827', symbolColor: '#94A3B8', height: 44 } : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev
    }
  })

  win.once('ready-to-show', () => win.show())

  // Không cho điều hướng / mở cửa sổ lạ trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    if (url.split('#')[0] === win.webContents.getURL().split('#')[0]) return
    e.preventDefault()
  })
  if (isDev) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
    })
  }

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  paths.init()
  log(`Khởi động Master Scoring ${app.getVersion()} (${process.platform})`)
  await openDb()
  await ensureDefaultAccount()
  await cleanupStale()
  recoverOnStartup()
  registerIpc()

  if (isMac) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' }
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopLocalSync()
  try {
    flush()
  } catch (e: any) {
    log('flush lỗi: ' + e?.message)
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
