import {
  accountDisplayNameSchema,
  passwordSchema,
  usernameSchema,
} from '@drawing-games/protocol'
import { describe, expect, test } from 'vitest'

import {
  USERNAME_HINT,
  currentPasswordIssue,
  displayNameIssue,
  newPasswordIssue,
  usernameIssue,
} from './form-validation'

describe('usernameIssue', () => {
  test('accepts exactly what the protocol schema accepts', () => {
    const samples = [
      '',
      ' ',
      'ab',
      'abc',
      ' Mina ',
      'MINA_42',
      'a'.repeat(20),
      'a'.repeat(21),
      'mi na',
      'mina-k',
      'émile',
      'mina!',
      '__',
      '___',
      '12345',
    ]
    for (const sample of samples) {
      expect(usernameIssue(sample) === undefined, sample).toBe(
        usernameSchema.safeParse(sample).success,
      )
    }
  })

  test('errors say what to do and differ from the hint', () => {
    expect(usernameIssue('')).toBe('Enter a username.')
    expect(usernameIssue('ab')).toBe(
      'Add 1 more character: usernames need at least 3.',
    )
    expect(usernameIssue('a')).toBe(
      'Add 2 more characters: usernames need at least 3.',
    )
    expect(usernameIssue('mi na-k')).toBe(
      'Remove spaces, “-”: only letters, numbers, and underscores work.',
    )
    expect(usernameIssue('a'.repeat(21))).toBe(
      'Shorten it to 20 characters or fewer.',
    )
    for (const sample of ['', 'ab', 'mi-na', 'a'.repeat(21)]) {
      expect(usernameIssue(sample)).not.toBe(USERNAME_HINT)
    }
  })
})

describe('password checks', () => {
  test('sign-up passwords match the protocol schema', () => {
    for (const sample of [
      '',
      '1',
      '12345',
      '123456',
      ' '.repeat(6),
      'x'.repeat(128),
      'x'.repeat(129),
    ]) {
      expect(newPasswordIssue(sample) === undefined, `${sample.length}`).toBe(
        passwordSchema.safeParse(sample).success,
      )
    }
    expect(newPasswordIssue('')).toBe('Choose a password.')
    expect(newPasswordIssue('123')).toBe(
      'Add 3 more characters: passwords need at least 6.',
    )
    expect(newPasswordIssue('12345')).toBe(
      'Add 1 more character: passwords need at least 6.',
    )
  })

  test('logging in only needs a password', () => {
    expect(currentPasswordIssue('')).toBe('Enter your password.')
    expect(currentPasswordIssue('1')).toBeUndefined()
  })
})

test('display names are optional and capped at 24 characters', () => {
  expect(displayNameIssue('')).toBeUndefined()
  expect(displayNameIssue('   ')).toBeUndefined()
  for (const sample of ['Mina', 'x'.repeat(24), 'x'.repeat(25)]) {
    expect(displayNameIssue(sample) === undefined).toBe(
      accountDisplayNameSchema.safeParse(sample).success,
    )
  }
  expect(displayNameIssue('x'.repeat(25))).toBe(
    'Shorten it to 24 characters or fewer.',
  )
})
