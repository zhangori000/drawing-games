import { z } from 'zod'

import {
  MAX_DRAWING_OPERATIONS_PER_BATCH,
  drawingOperationSchema,
} from './drawing'
import {
  PROTOCOL_VERSION,
  commandIdSchema,
  roomCodeSchema,
  sequenceSchema,
  sessionIdSchema,
} from './shared'

/**
 * Draft option ids are word-bank word ids (`pack/slug`). The original v1
 * opaque form (`word_2`) stays valid for old fixtures.
 */
const optionIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?$/)

/**
 * Longest custom word, in code points (an emoji is one), matching the room's
 * `ROOM_SETTINGS_LIMITS.customWords.maxLength`. The room cleans and drops
 * words outside its limits itself; this only bounds what may be sent.
 */
export const MAX_CUSTOM_WORD_LENGTH = 32

const customWordSchema = z
  .string()
  .trim()
  .min(1)
  .refine((word) => Array.from(word).length <= MAX_CUSTOM_WORD_LENGTH, {
    message: `Custom words are at most ${MAX_CUSTOM_WORD_LENGTH} characters.`,
  })

const opaqueTokenSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[A-Za-z0-9_.-]+$/)

const wordIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+\/[a-z0-9-]+$/)

const memberIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

export const teamIdSchema = z.enum(['A', 'B'])

export const displayNameSchema = z.string().trim().min(1).max(24)

/** Recently seen word ids a guest browser remembers (personalization only). */
export const recentWordIdsSchema = z.array(wordIdSchema).max(300)

/**
 * Bind this socket to an existing member. `resumeToken` was issued by the
 * room in `session.issued`; `accountToken` optionally (re)links a quick
 * account. Both are optional on the wire so the oldest v1 fixture stays
 * valid; the room rejects a resume without a token as UNAUTHORIZED.
 */
export const resumeCommandSchema = z.strictObject({
  type: z.literal('room.resume'),
  resumeToken: opaqueTokenSchema.optional(),
  accountToken: opaqueTokenSchema.optional(),
})

export const joinCommandSchema = z.strictObject({
  type: z.literal('room.join'),
  displayName: z.string().trim().min(1).max(32),
  accountToken: opaqueTokenSchema.optional(),
  recentWordIds: recentWordIdsSchema.optional(),
  team: teamIdSchema.optional(),
})

export const leaveCommandSchema = z.strictObject({
  type: z.literal('room.leave'),
})

export const accountLinkCommandSchema = z.strictObject({
  type: z.literal('account.link'),
  /** null unlinks the account from this room membership. */
  accountToken: opaqueTokenSchema.nullable(),
})

export const renameCommandSchema = z.strictObject({
  type: z.literal('member.rename'),
  displayName: displayNameSchema,
})

export const lobbyTeamCommandSchema = z.strictObject({
  type: z.literal('lobby.team'),
  team: teamIdSchema,
  /** Host only: move someone else (or a bot). Defaults to the sender. */
  memberId: memberIdSchema.optional(),
})

export const lobbyShuffleCommandSchema = z.strictObject({
  type: z.literal('lobby.shuffle'),
})

export const lobbyReadyCommandSchema = z.strictObject({
  type: z.literal('lobby.ready'),
  ready: z.boolean(),
})

/** Shape-level validation only; game-core enforces ranges and allowed values. */
export const roomSettingsPatchSchema = z.strictObject({
  rounds: z.number().int().min(1).max(32).optional(),
  drawingSeconds: z.number().int().min(10).max(600).optional(),
  wordDraftSeconds: z.number().int().min(5).max(120).optional(),
  roundResultsSeconds: z.number().int().min(1).max(120).optional(),
  wordChoiceCount: z.number().int().min(1).max(10).optional(),
  replacementsPerDrawer: z.number().int().min(0).max(10).optional(),
  opponentDraftVisibility: z
    .enum(['options-and-actions', 'actions-only', 'hidden'])
    .optional(),
  wordLengthMode: z.enum(['hidden-vote', 'shown', 'hidden']).optional(),
  hintUnlockSeconds: z.number().int().min(0).max(600).optional(),
  hintCost: z.number().int().min(0).max(100).optional(),
  difficultyMix: z.enum(['balanced', 'easy', 'mixed', 'hard']).optional(),
  packIds: z
    .array(
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9-]+$/),
    )
    .max(32)
    .optional(),
  customWords: z.array(customWordSchema).max(300).optional(),
  customWordsMode: z.enum(['mix', 'only']).optional(),
  categoryHint: z.boolean().optional(),
  showdown: z.boolean().optional(),
  showdownSeconds: z.number().int().min(10).max(600).optional(),
})

export const lobbySettingsCommandSchema = z.strictObject({
  type: z.literal('lobby.settings'),
  patch: roomSettingsPatchSchema,
})

export const lobbyAddBotCommandSchema = z.strictObject({
  type: z.literal('lobby.bot.add'),
  team: teamIdSchema,
})

export const lobbyRemoveMemberCommandSchema = z.strictObject({
  type: z.literal('lobby.member.remove'),
  memberId: memberIdSchema,
})

export const matchStartCommandSchema = z.strictObject({
  type: z.literal('match.start'),
})

export const roundContinueCommandSchema = z.strictObject({
  type: z.literal('round.continue'),
})

export const draftSelectCommandSchema = z.strictObject({
  type: z.literal('draft.select'),
  optionId: optionIdSchema,
})

export const draftSeenCommandSchema = z.strictObject({
  type: z.literal('draft.seen'),
  optionId: optionIdSchema,
})

export const draftReplacementReasonSchema = z.enum([
  'seen-before',
  'unknown-definition',
])

/**
 * Reasoned replacement command. `draft.seen` remains accepted so a rolling
 * deployment can drain older clients without translating their command ids.
 */
export const draftReplaceCommandSchema = z.strictObject({
  type: z.literal('draft.replace'),
  optionId: optionIdSchema,
  reason: draftReplacementReasonSchema,
})

export const guessCommandSchema = z.strictObject({
  type: z.literal('guess.submit'),
  text: z.string().trim().min(1).max(120),
})

export const hintCommandSchema = z.strictObject({
  type: z.literal('hint.vote'),
  hint: z.literal('word-length'),
  approve: z.boolean(),
})

export const drawingBatchCommandSchema = z.strictObject({
  type: z.literal('drawing.batch'),
  operations: z
    .array(drawingOperationSchema)
    .min(1)
    .max(MAX_DRAWING_OPERATIONS_PER_BATCH),
})

export const surrenderCommandSchema = z.strictObject({
  type: z.literal('surrender.vote'),
  approve: z.boolean(),
})

export const rematchCommandSchema = z.strictObject({
  type: z.literal('rematch.vote'),
  mode: z.enum(['same-settings', 'change-settings', 'decline']),
})

export const clientCommandSchema = z.discriminatedUnion('type', [
  resumeCommandSchema,
  joinCommandSchema,
  leaveCommandSchema,
  accountLinkCommandSchema,
  renameCommandSchema,
  lobbyTeamCommandSchema,
  lobbyShuffleCommandSchema,
  lobbyReadyCommandSchema,
  lobbySettingsCommandSchema,
  lobbyAddBotCommandSchema,
  lobbyRemoveMemberCommandSchema,
  matchStartCommandSchema,
  roundContinueCommandSchema,
  draftSelectCommandSchema,
  draftSeenCommandSchema,
  draftReplaceCommandSchema,
  guessCommandSchema,
  hintCommandSchema,
  drawingBatchCommandSchema,
  surrenderCommandSchema,
  rematchCommandSchema,
])

export const commandEnvelopeV1Schema = z.strictObject({
  version: z.literal(PROTOCOL_VERSION),
  commandId: commandIdSchema,
  sessionId: sessionIdSchema,
  roomCode: roomCodeSchema,
  clientSeq: sequenceSchema.refine((value) => value > 0, {
    message: 'clientSeq must start at 1',
  }),
  lastRoomSeq: sequenceSchema,
  command: clientCommandSchema,
})

export type ResumeCommand = z.infer<typeof resumeCommandSchema>
export type JoinCommand = z.infer<typeof joinCommandSchema>
export type LeaveCommand = z.infer<typeof leaveCommandSchema>
export type AccountLinkCommand = z.infer<typeof accountLinkCommandSchema>
export type RenameCommand = z.infer<typeof renameCommandSchema>
export type LobbyTeamCommand = z.infer<typeof lobbyTeamCommandSchema>
export type LobbyShuffleCommand = z.infer<typeof lobbyShuffleCommandSchema>
export type LobbyReadyCommand = z.infer<typeof lobbyReadyCommandSchema>
export type RoomSettingsPatch = z.infer<typeof roomSettingsPatchSchema>
export type LobbySettingsCommand = z.infer<typeof lobbySettingsCommandSchema>
export type LobbyAddBotCommand = z.infer<typeof lobbyAddBotCommandSchema>
export type LobbyRemoveMemberCommand = z.infer<
  typeof lobbyRemoveMemberCommandSchema
>
export type MatchStartCommand = z.infer<typeof matchStartCommandSchema>
export type RoundContinueCommand = z.infer<typeof roundContinueCommandSchema>
export type DraftSelectCommand = z.infer<typeof draftSelectCommandSchema>
export type DraftSeenCommand = z.infer<typeof draftSeenCommandSchema>
export type DraftReplacementReason = z.infer<
  typeof draftReplacementReasonSchema
>
export type DraftReplaceCommand = z.infer<typeof draftReplaceCommandSchema>
export type GuessCommand = z.infer<typeof guessCommandSchema>
export type HintCommand = z.infer<typeof hintCommandSchema>
export type DrawingBatchCommand = z.infer<typeof drawingBatchCommandSchema>
export type SurrenderCommand = z.infer<typeof surrenderCommandSchema>
export type RematchCommand = z.infer<typeof rematchCommandSchema>
export type ClientCommand = z.infer<typeof clientCommandSchema>
export type CommandEnvelopeV1 = z.infer<typeof commandEnvelopeV1Schema>

export function parseCommandEnvelopeV1(input: unknown): CommandEnvelopeV1 {
  return commandEnvelopeV1Schema.parse(input)
}
