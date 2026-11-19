import { z } from 'zod'

/**
 * Quick-account HTTP contract between the web app and the realtime Worker.
 * Usernames are case-insensitive and normalized to lowercase. No email or
 * other personal data is collected.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
export const MIN_PASSWORD_LENGTH = 6
export const MAX_PASSWORD_LENGTH = 128

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, '3–20 letters, numbers, or underscores')

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH)

export const accountDisplayNameSchema = z.string().trim().min(1).max(24)

/** POST /accounts */
export const signupRequestSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  displayName: accountDisplayNameSchema.optional(),
})

/** POST /accounts/session */
export const loginRequestSchema = z.strictObject({
  username: usernameSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

/** PATCH /accounts/me */
export const updateProfileRequestSchema = z.strictObject({
  displayName: accountDisplayNameSchema,
})

export type SignupRequest = z.infer<typeof signupRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>

/**
 * Session tokens look like `<username>.<random base64url>` so the Worker can
 * route to the right account actor without a global index. Only a SHA-256
 * hash of the token is stored server-side.
 */
export const ACCOUNT_TOKEN_PATTERN = /^[a-z0-9_]{3,20}\.[A-Za-z0-9_-]{32,128}$/

export function accountIdFromToken(token: string): string | null {
  if (!ACCOUNT_TOKEN_PATTERN.test(token)) return null
  const dot = token.indexOf('.')
  return token.slice(0, dot)
}

/** Error body for every non-2xx account response. */
export interface AccountErrorBody {
  readonly error: string
  readonly code:
    | 'INVALID_INPUT'
    | 'USERNAME_TAKEN'
    | 'INVALID_CREDENTIALS'
    | 'RATE_LIMITED'
    | 'UNAUTHORIZED'
    | 'NOT_FOUND'
    | 'INTERNAL'
}
