import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Cầu nối an toàn: renderer chỉ gọi được invoke(channel) và lắng nghe sự kiện "evt:*".
const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args),
  on: (event: string, cb: (payload: unknown) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on('evt:' + event, listener)
    return () => ipcRenderer.removeListener('evt:' + event, listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
