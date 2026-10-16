// Registry agent. Thêm agent mới: tạo file trong thư mục này (system prompt + bộ công cụ), đặt tên trong
// `../constants.ts` và đăng ký vào AGENT_REGISTRY.
import { AGENT_NAME, type AgentName } from '../constants'
import { dataAnalystAgent } from './dataAnalyst'

export const AGENT_REGISTRY = {
  [AGENT_NAME.dataAnalyst]: dataAnalystAgent
} as const satisfies Record<AgentName, unknown>

export const getAgent = <K extends AgentName>(name: K): (typeof AGENT_REGISTRY)[K] => AGENT_REGISTRY[name]
