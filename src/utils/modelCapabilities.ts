import type { HarnessImageDetail, HarnessThinkingLevel } from '../types/harness'

/** 只识别已适配的精确 Model ID，保留固定版本号。 */
export const DOUBAO_MODEL_NAMES = ['doubao-seed-evolving', 'bytedance/doubao-seed-evolving', 'doubao-seed-2.1-pro-260628', 'bytedance/doubao-seed-2.1-pro-260628'] as const
export const VISION_MODEL = 'deepseek-v4-flash-vision-exp'
export const AUTO_MODEL = 'deepseek-auto'

/** 精确判断是否为字节 Doubao-Seed-Evolving 模型。 */
export function isDoubaoModel(model: string | null | undefined): boolean {
  if (!model) return false
  return (DOUBAO_MODEL_NAMES as readonly string[]).includes(model.trim())
}

export function modelDisplayName(model: string): string {
  if (model.trim().endsWith('doubao-seed-2.1-pro-260628') && isDoubaoModel(model)) return 'Seed-2.1-Pro · 260628'
  return isDoubaoModel(model) ? 'Doubao-Seed-Evolving' : model
}

/** 模型是否支持图片输入（Doubao 原生多模态、视觉模型或 DeepSeek 自动路由）。 */
export function modelSupportsImages(model: string | null | undefined): boolean {
  if (!model) return false
  const value = model.trim()
  return isDoubaoModel(value) || value === VISION_MODEL || value === AUTO_MODEL
}

/** 模型是否支持 Doubao 七档思考等级。 */
export function modelSupportsThinkingLevel(model: string | null | undefined): boolean {
  return isDoubaoModel(model)
}

/** 模型是否支持 Doubao 图片精度 low/high/xhigh。 */
export function modelSupportsImageDetail(model: string | null | undefined): boolean {
  return isDoubaoModel(model)
}

export const THINKING_LEVEL_OPTIONS: ReadonlyArray<{
  value: HarnessThinkingLevel
  label: string
  hint: string
}> = [
  { value: 'none', label: '关闭', hint: '直接回答，不启用额外思考' },
  { value: 'minimal', label: '极简', hint: '少量思考，适合明确的小改动' },
  { value: 'low', label: '轻快', hint: '较快响应，适合常规任务' },
  { value: 'medium', label: '均衡', hint: '兼顾思考深度与响应速度' },
  { value: 'high', label: '深入', hint: '更充分地分析复杂问题 · 默认' },
  { value: 'xhigh', label: '极深', hint: '投入更多思考，适合棘手任务' },
  { value: 'max', label: '最深', hint: '最高思考投入，等待时间可能更长' },
]

export const DEFAULT_THINKING_LEVEL: HarnessThinkingLevel = 'high'

export const DOUBAO_IMAGE_DETAIL_OPTIONS: ReadonlyArray<{
  value: HarnessImageDetail
  label: string
}> = [
  { value: 'low', label: '低清' },
  { value: 'high', label: '高清' },
  { value: 'xhigh', label: '超高清' },
]

export const DEFAULT_DOUBAO_IMAGE_DETAIL: HarnessImageDetail = 'high'
