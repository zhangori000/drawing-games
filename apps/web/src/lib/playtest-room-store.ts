import 'server-only'

import {
  projectPublicRoomView,
  type AuthoritativeRoomViewSource,
  type TeamId,
} from '@drawing-games/game-core'

import {
  PLAYTEST_PARTICIPANTS,
  type PlaytestGuessView,
  type PlaytestParticipantId,
  type PlaytestRoomView,
  type PlaytestTeamId,
  type PlaytestTeamView,
} from './playtest-room-contract'

interface StoredGuess {
  readonly id: string
  readonly participantId: PlaytestParticipantId
  readonly text: string
  readonly correct: boolean
}

interface StoredPlaytestRoom {
  revision: number
  readonly guesses: StoredGuess[]
  readonly solvedTeams: Set<PlaytestTeamId>
}

const MAX_ROOMS = 32
const MAX_GUESSES_PER_ROOM = 24
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/
const TEAM_WORDS: Readonly<Record<PlaytestTeamId, string>> = {
  'team-a': 'lighthouse',
  'team-b': 'volcano',
}
const DOMAIN_TEAMS: Readonly<Record<PlaytestTeamId, TeamId>> = {
  'team-a': 'A',
  'team-b': 'B',
}

const globalRoomStore = globalThis as typeof globalThis & {
  __drawingGamesPlaytestRooms?: Map<string, StoredPlaytestRoom>
}

const rooms =
  globalRoomStore.__drawingGamesPlaytestRooms ??
  new Map<string, StoredPlaytestRoom>()

globalRoomStore.__drawingGamesPlaytestRooms = rooms

export function isPlaytestRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value)
}

export function resetPlaytestRoom(roomCode: string): void {
  assertRoomCode(roomCode)
  rooms.set(roomCode, createRoom())
}

export function getPlaytestRoomView(
  roomCode: string,
  participantId: PlaytestParticipantId,
): PlaytestRoomView {
  assertRoomCode(roomCode)
  const room = getOrCreateRoom(roomCode)
  return projectRoom(roomCode, room, participantId)
}

export function submitPlaytestGuess(
  roomCode: string,
  participantId: PlaytestParticipantId,
  rawGuess: string,
): PlaytestRoomView {
  assertRoomCode(roomCode)
  const participant = PLAYTEST_PARTICIPANTS[participantId]
  if (participant.role !== 'guesser') {
    throw new Error('Only guessers can submit guesses')
  }

  const text = rawGuess.trim()
  if (text.length === 0 || text.length > 120) {
    throw new Error('Guess must contain between 1 and 120 characters')
  }

  const room = getOrCreateRoom(roomCode)
  const correct =
    normalizeGuess(text) === normalizeGuess(TEAM_WORDS[participant.teamId])
  room.revision += 1
  room.guesses.push({
    id: `${room.revision}-${participantId}`,
    participantId,
    text,
    correct,
  })
  if (room.guesses.length > MAX_GUESSES_PER_ROOM) room.guesses.shift()
  if (correct) room.solvedTeams.add(participant.teamId)

  return projectRoom(roomCode, room, participantId)
}

function getOrCreateRoom(roomCode: string): StoredPlaytestRoom {
  const existing = rooms.get(roomCode)
  if (existing) return existing

  if (rooms.size >= MAX_ROOMS) {
    const oldestRoomCode = rooms.keys().next().value
    if (typeof oldestRoomCode === 'string') rooms.delete(oldestRoomCode)
  }

  const room = createRoom()
  rooms.set(roomCode, room)
  return room
}

function createRoom(): StoredPlaytestRoom {
  return {
    revision: 0,
    guesses: [],
    solvedTeams: new Set(),
  }
}

function projectRoom(
  roomCode: string,
  room: StoredPlaytestRoom,
  participantId: PlaytestParticipantId,
): PlaytestRoomView {
  const participant = PLAYTEST_PARTICIPANTS[participantId]
  const finalWord = TEAM_WORDS[participant.teamId]
  const domainTeam = DOMAIN_TEAMS[participant.teamId]
  const authoritative = createAuthoritativeViewSource(roomCode, room)
  const publicView = projectPublicRoomView(authoritative, {
    kind: 'player',
    playerId: participantId,
  })
  const chosenWord = publicView.round?.drafts[domainTeam].chosenWord

  return {
    roomCode,
    revision: publicView.roomSeq,
    participant,
    phase: 'drawing',
    round: {
      current: 2,
      total: 6,
      secondsRemaining: 54,
    },
    word:
      chosenWord?.visibility === 'drawer-only'
        ? {
            visibility: 'drawer-only',
            value: chosenWord.word,
            length: chosenWord.word.length,
            difficulty: chosenWord.difficulty,
          }
        : {
            visibility: 'length-only',
            length: finalWord.length,
          },
    teams: createTeamViews(room),
    recentGuesses: room.guesses.slice(-6).map(projectGuess),
  }
}

function createAuthoritativeViewSource(
  roomCode: string,
  room: StoredPlaytestRoom,
): AuthoritativeRoomViewSource {
  return {
    roomCode,
    roomSeq: room.revision,
    phase: 'drawing',
    scores: { A: 680, B: 610 },
    opponentDraftVisibility: 'options-and-actions',
    players: Object.values(PLAYTEST_PARTICIPANTS).map((player) => ({
      id: player.id,
      displayName: player.displayName,
      team: DOMAIN_TEAMS[player.teamId],
    })),
    round: {
      number: 2,
      drawers: {
        A: 'team-a-drawer',
        B: 'team-b-drawer',
      },
      drafts: {
        A: createAuthoritativeDraft('team-a', 'team-a-word'),
        B: createAuthoritativeDraft('team-b', 'team-b-word'),
      },
      solved: {
        A: room.solvedTeams.has('team-a'),
        B: room.solvedTeams.has('team-b'),
      },
      draftDeadlineAtMs: 0,
      drawingDeadlineAtMs: 90_000,
    },
  }
}

function createAuthoritativeDraft(
  teamId: PlaytestTeamId,
  optionId: string,
): NonNullable<AuthoritativeRoomViewSource['round']>['drafts'][TeamId] {
  return {
    options: [
      {
        id: optionId,
        word: TEAM_WORDS[teamId],
        difficulty: 'hard',
      },
    ],
    seenOptionIds: [],
    chosenOptionId: optionId,
  }
}

function createTeamViews(room: StoredPlaytestRoom): PlaytestTeamView[] {
  return [
    {
      id: 'team-a',
      name: 'Team Sun',
      score: 680,
      solved: room.solvedTeams.has('team-a'),
      members: [
        PLAYTEST_PARTICIPANTS['team-a-drawer'],
        PLAYTEST_PARTICIPANTS['team-a-guesser'],
      ],
    },
    {
      id: 'team-b',
      name: 'Team Moon',
      score: 610,
      solved: room.solvedTeams.has('team-b'),
      members: [
        PLAYTEST_PARTICIPANTS['team-b-drawer'],
        PLAYTEST_PARTICIPANTS['team-b-guesser'],
      ],
    },
  ]
}

function projectGuess(guess: StoredGuess): PlaytestGuessView {
  const participant = PLAYTEST_PARTICIPANTS[guess.participantId]
  return {
    id: guess.id,
    teamId: participant.teamId,
    result: guess.correct ? 'correct' : 'incorrect',
    announcement: guess.correct
      ? `${participant.displayName} solved it for their team.`
      : `${participant.displayName} guessed “${guess.text}”.`,
  }
}

function normalizeGuess(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

function assertRoomCode(roomCode: string): void {
  if (!isPlaytestRoomCode(roomCode)) throw new Error('Invalid room code')
}
