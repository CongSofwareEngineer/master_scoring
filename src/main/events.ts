// Đẩy sự kiện từ main sang renderer (tiến trình chấm, trạng thái AI, tải model...).
import { BrowserWindow } from 'electron'

export function emit(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('evt:' + channel, payload)
  }
}
