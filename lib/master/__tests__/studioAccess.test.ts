// SP-039 Slice 4C2-App — Studio gate: pending owners get the workspace.

import { describe, expect, it } from 'vitest'
import { resolveStudioGate } from '../studioAccess'

describe('resolveStudioGate', () => {
  it('no linked profile keeps the safe empty state', () => {
    expect(resolveStudioGate(null)).toEqual({ kind: 'none' })
  })
  it('rejected profiles keep the rejection notice', () => {
    expect(resolveStudioGate('rejected')).toEqual({ kind: 'rejected' })
  })
  it('claimed pending owners enter the workspace (Slice-2 deferral lifted)', () => {
    expect(resolveStudioGate('pending')).toEqual({
      kind: 'workspace',
      pendingModeration: true,
    })
  })
  it('approved owners enter the workspace without the moderation flag', () => {
    expect(resolveStudioGate('approved')).toEqual({
      kind: 'workspace',
      pendingModeration: false,
    })
  })
})
