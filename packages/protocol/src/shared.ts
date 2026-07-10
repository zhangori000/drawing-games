import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export const commandIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(OPAQUE_ID_PATTERN)

export const sessionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(OPAQUE_ID_PATTERN)

export const strokeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(OPAQUE_ID_PATTERN)

/** Canonical wire form. User input should be trimmed/upcased before encoding. */
export const roomCodeSchema = z.string().regex(/^[A-Z0-9]{4,8}$/)

export const sequenceSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
