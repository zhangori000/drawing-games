import { describe, expect, it } from 'vitest'

import resumeCommandV1 from '../fixtures/v1/room-resume-command.json'
import roomSnapshotV1 from '../fixtures/v1/room-snapshot-event.json'
import { parseCommandEnvelopeV1, parseServerEventEnvelopeV1 } from './index'

describe('protocol v1 compatibility fixtures', () => {
  it('keeps accepting the oldest supported client command', () => {
    expect(parseCommandEnvelopeV1(resumeCommandV1)).toEqual(resumeCommandV1)
  })

  it('keeps accepting the oldest supported server snapshot', () => {
    expect(parseServerEventEnvelopeV1(roomSnapshotV1)).toEqual(roomSnapshotV1)
  })

  it('fails explicitly instead of guessing at an unsupported major version', () => {
    expect(() =>
      parseCommandEnvelopeV1({ ...resumeCommandV1, version: 2 }),
    ).toThrow()
    expect(() =>
      parseServerEventEnvelopeV1({ ...roomSnapshotV1, version: 2 }),
    ).toThrow()
  })
})
