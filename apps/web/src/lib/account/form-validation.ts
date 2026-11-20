import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  accountDisplayNameSchema,
} from '@drawing-games/protocol'

/**
 * Client-side checks for the quick-account forms. They accept exactly what
 * the protocol schemas accept (see form-validation.test.ts), but each error
 * says what to do next instead of repeating the rule shown as the hint.
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
export const DISPLAY_NAME_MAX_LENGTH = 24

export const USERNAME_HINT = '3–20 letters, numbers, or underscores'
export const NEW_PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. There is no reset by email, so keep it somewhere safe.`

function moreCharacters(missing: number): string {
  return `${missing} more character${missing === 1 ? '' : 's'}`
}

/** Mirrors `usernameSchema` (trimmed, lower-cased, `[a-z0-9_]{3,20}`). */
export function usernameIssue(value: string): string | undefined {
  const name = value.trim().toLowerCase()
  if (name.length === 0) return 'Enter a username.'
  const invalid = [...new Set(name.replace(/[a-z0-9_]/g, ''))]
  if (invalid.length > 0) {
    const shown = invalid
      .slice(0, 3)
      .map((character) => (/\s/.test(character) ? 'spaces' : `“${character}”`))
      .join(', ')
    return `Remove ${shown}: only letters, numbers, and underscores work.`
  }
  if (name.length < USERNAME_MIN_LENGTH) {
    return `Add ${moreCharacters(USERNAME_MIN_LENGTH - name.length)}: usernames need at least ${USERNAME_MIN_LENGTH}.`
  }
  if (name.length > USERNAME_MAX_LENGTH) {
    return `Shorten it to ${USERNAME_MAX_LENGTH} characters or fewer.`
  }
  return undefined
}

/** Mirrors `passwordSchema`, for choosing a password on sign-up. */
export function newPasswordIssue(value: string): string | undefined {
  if (value.length === 0) return 'Choose a password.'
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Add ${moreCharacters(MIN_PASSWORD_LENGTH - value.length)}: passwords need at least ${MIN_PASSWORD_LENGTH}.`
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Shorten it to ${MAX_PASSWORD_LENGTH} characters or fewer.`
  }
  return undefined
}

/** Logging in only needs some password; the server checks it. */
export function currentPasswordIssue(value: string): string | undefined {
  return value.length === 0 ? 'Enter your password.' : undefined
}

/** The display name is optional; when given it must fit 24 characters. */
export function displayNameIssue(value: string): string | undefined {
  if (value.trim().length === 0) return undefined
  return accountDisplayNameSchema.safeParse(value).success
    ? undefined
    : `Shorten it to ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
}
