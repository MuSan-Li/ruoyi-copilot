import { describe, expect, it } from 'vitest'
import { isDoubaoModel, modelDisplayName, modelSupportsThinkingLevel } from './modelCapabilities'

describe('fixed Seed 2.1 model identity', () => {
  it('retains the version in the picker and enables the Doubao session configuration', () => {
    const id = 'bytedance/doubao-seed-2.1-pro-260628'
    expect(isDoubaoModel(id)).toBe(true)
    expect(modelSupportsThinkingLevel(id)).toBe(true)
    expect(modelDisplayName(id)).toBe('Seed-2.1-Pro · 260628')
    expect(modelDisplayName('bytedance/doubao-seed-evolving')).toBe('Doubao-Seed-Evolving')
    expect(isDoubaoModel('bytedance/doubao-seed-2.1-pro-unknown')).toBe(false)
  })
})
