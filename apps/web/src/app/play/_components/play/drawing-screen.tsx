'use client'

import { TEAM_NAMES, type RoundView } from '@drawing-games/game-core'
import { useState } from 'react'

import { useDrawingTools } from '@/components/drawing/use-drawing-tools'
import { GuessDock } from '@/components/guess/guess-dock'

import { plural } from '../../_lib/format'
import { useRoomSession } from '../room-session'
import { DrawerCanvas, ReadOnlyCanvas } from '../shared/room-canvas'
import { SolvedBanner, WordBanner } from './banners'
import { ClueBanner } from './clue-banner'
import { DrawerToolbar } from './drawer-toolbar'
import { GuessFeed, LatestTeamGuess } from './guess-feed'
import { OpponentChip, OpponentTile } from './opponent-tile'
import { PlayLayout } from './play-layout'
import { Scoreboard } from './scoreboard'
import { useFreshFeedback } from './use-fresh-feedback'

/** Simultaneous drawing and guessing for one normal round. */
export function DrawingScreen({ round }: { readonly round: RoundView }) {
  const { me, actions } = useRoomSession()
  const mine = round.mine
  const opponent = round.opponent
  const [watching, setWatching] = useState(false)
  const feedback = useFreshFeedback()
  const tools = useDrawingTools()

  if (!mine || !opponent) return null
  const opponentName = TEAM_NAMES[opponent.team]
  const watchingOpponent = watching && opponent.canvasAccess === 'full'
  const drawing = mine.amDrawer && mine.canDraw && !watchingOpponent
  const solution = mine.solution
  const opponentStatus = opponent.solved
    ? 'Solved!'
    : plural(opponent.guessCount, 'guess', 'guesses')

  const watchToggle =
    opponent.canvasAccess === 'full' ? (
      <button
        type="button"
        onClick={() => setWatching((value) => !value)}
        className="min-h-11 shrink-0 rounded-xl border-2 border-[#181713] bg-white px-3 text-xs font-black text-[#181713]"
      >
        {watchingOpponent ? 'Back to ours' : `Watch ${opponentName}`}
      </button>
    ) : null

  const banner = solution ? (
    <SolvedBanner
      title={
        solution.guesserId === me.memberId
          ? 'You got it!'
          : `${solution.guesserName} guessed it!`
      }
      points={solution.points}
      breakdown={solution.breakdown}
      difficulty={mine.difficulty}
      action={watchToggle}
    />
  ) : mine.amDrawer && mine.word ? (
    <WordBanner
      term={mine.word.term}
      difficulty={mine.word.difficulty}
      unrated={mine.word.unrated}
      definition={mine.word.definition}
      packName={mine.word.packName}
      note={
        mine.word.autoPicked ? (
          <span data-testid="auto-picked-note">
            Time ran out, so we picked this card for you.
          </span>
        ) : undefined
      }
    />
  ) : (
    <ClueBanner
      drawerName={mine.drawerName}
      difficulty={mine.difficulty}
      category={mine.category}
      pattern={mine.pattern}
      letterCount={mine.letterCount}
      hint={mine.hint}
      solved={mine.solved}
      guessing={!mine.amDrawer && mine.canGuess}
    />
  )

  const canvas = watchingOpponent ? (
    <ReadOnlyCanvas
      canvasId={opponent.canvasId}
      label={`${opponentName}'s drawing`}
      className="size-full"
      testId="team-canvas"
    />
  ) : drawing ? (
    <DrawerCanvas
      canvasId={mine.canvasId}
      label="Your canvas. Draw your word here."
      tool={tools.tool}
      color={tools.color}
      width={tools.width}
      className="size-full"
      testId="team-canvas"
    />
  ) : (
    <ReadOnlyCanvas
      canvasId={mine.canvasId}
      label={`${mine.drawerName}'s drawing`}
      className="size-full"
      testId="team-canvas"
    />
  )

  return (
    <PlayLayout
      banner={banner}
      canvas={canvas}
      tools={
        drawing ? (
          <DrawerToolbar canvasId={mine.canvasId} tools={tools} />
        ) : null
      }
      dock={
        mine.amDrawer ? null : (
          <div data-testid="guess-dock">
            <GuessDock
              onGuess={actions.guess}
              feedback={feedback}
              idleStatus={<LatestTeamGuess guesses={mine.guesses} />}
              statusAside={
                <OpponentChip
                  team={opponent.team}
                  done={opponent.solved}
                  status={opponentStatus}
                />
              }
              disabledReason={
                mine.canGuess
                  ? null
                  : mine.solved
                    ? `Solved! Now watch ${opponentName} scramble.`
                    : 'Guessing is closed.'
              }
            />
          </div>
        )
      }
      feed={
        <GuessFeed
          guesses={mine.guesses}
          label="Team guesses"
          emptyText={
            mine.amDrawer
              ? 'Your team’s guesses show up here.'
              : 'No guesses yet. Be the first!'
          }
        />
      }
      opponent={
        <OpponentTile
          team={opponent.team}
          canvasId={opponent.canvasId}
          access={opponent.canvasAccess}
          drawerName={opponent.drawerName}
          done={opponent.solved}
          status={opponentStatus}
          watching={watchingOpponent}
          onToggleWatch={() => setWatching((value) => !value)}
        />
      }
      aside={<Scoreboard />}
    />
  )
}
