import { describe, expect, it } from 'vitest'

import unknownDefinitionCommandV1 from '../fixtures/v1/draft-unknown-definition-command.json'
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

  it('keeps the reasoned unknown-definition replacement example valid', () => {
    expect(parseCommandEnvelopeV1(unknownDefinitionCommandV1)).toEqual(
      unknownDefinitionCommandV1,
    )
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
