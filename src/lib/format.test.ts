import { describe, expect, it } from 'vitest'
import { friendlyAuthError, initials } from './format'

describe('format helpers', () => {
  it('creates a compact avatar label', () => {
    expect(initials('なぎ 太郎')).toBe('なぎ')
    expect(initials('')).toBe('N')
  })

  it('turns Firebase errors into helpful Japanese', () => {
    expect(friendlyAuthError({ code: 'auth/weak-password' })).toContain('6文字')
    expect(friendlyAuthError(new Error('unknown'))).toContain('失敗')
  })
})

