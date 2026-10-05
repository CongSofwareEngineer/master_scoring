import { app } from 'electron'
import { statfs } from 'fs/promises'
import os from 'os'
import type { HardwareInfo } from '@shared/types'

// Thông tin máy chỉ để hiển thị và ước tính thời gian chấm — không chặn cài đặt hay chấm bài.
export async function getHardware(modelsDir: string): Promise<HardwareInfo> {
  let gpu = ''
  let discreteGpu = false
  try {
    const info: any = await app.getGPUInfo('basic')
    const devices: any[] = info?.gpuDevice ?? []
    const names = devices.map((d) => d.deviceString || vendorName(d.vendorId)).filter(Boolean)
    gpu = [...new Set(names)].join(', ')
    discreteGpu = devices.some((d) => d.vendorId === 0x10de || d.vendorId === 0x1002)
  } catch {
    /* không đọc được GPU */
  }
  let diskFreeGb: number | null = null
  try {
    const s = await statfs(modelsDir)
    diskFreeGb = (s.bavail * s.bsize) / 1024 ** 3
  } catch {
    /* ổ không truy cập được */
  }
  return {
    ramGb: os.totalmem() / 1024 ** 3,
    freeRamGb: os.freemem() / 1024 ** 3,
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model?.trim() ?? '',
    gpu,
    discreteGpu,
    diskFreeGb,
    modelsDir,
    platform: process.platform
  }
}

function vendorName(id: number): string {
  if (id === 0x10de) return 'NVIDIA'
  if (id === 0x1002) return 'AMD'
  if (id === 0x8086) return 'Intel'
  return ''
}

export async function diskFreeBytes(dir: string): Promise<number | null> {
  try {
    const s = await statfs(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}
