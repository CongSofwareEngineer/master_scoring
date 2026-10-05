import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

// %LocalAppData%\MasterScoring\ trên Windows; thư mục userData tương ứng khi dev trên macOS/Linux.
function computeRoot(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'MasterScoring')
  }
  return join(app.getPath('appData'), 'MasterScoring')
}

export const paths = {
  root: '',
  data: '',
  db: '',
  models: '',
  runtime: '',
  work: '',
  logs: '',
  init(): void {
    this.root = computeRoot()
    this.data = join(this.root, 'data')
    this.db = join(this.data, 'app.db')
    this.models = join(this.root, 'models')
    this.runtime = join(this.root, 'runtime')
    // Thư mục làm việc ngắn để tránh lỗi đường dẫn > 260 ký tự
    this.work = join(this.root, 'w')
    this.logs = join(this.root, 'logs')
    for (const d of [this.root, this.data, this.models, this.runtime, this.work, this.logs]) {
      mkdirSync(d, { recursive: true })
    }
  }
}

// Runtime đóng gói sẵn trong bộ cài (resources/runtime). Khi dev: <project>/resources/runtime.
export function bundledRuntimeDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'runtime') : join(app.getAppPath(), 'resources', 'runtime')
}
