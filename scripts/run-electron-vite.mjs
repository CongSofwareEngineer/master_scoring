// Chạy electron-vite với môi trường sạch.
// Một số môi trường (vd. tiến trình con của VS Code extension) đặt ELECTRON_RUN_AS_NODE=1,
// khiến Electron chạy như Node thuần và app không khởi động được.
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', process.argv.slice(2), { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
