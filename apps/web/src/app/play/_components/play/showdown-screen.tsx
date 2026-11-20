'use client'

import { TEAM_NAMES, type ShowdownView } from '@drawing-games/game-core'
import { useState } from 'react'

import { useDrawingTools } from '@/components/drawing/use-drawing-tools'
import { GuessDock } from '@/components/guess/guess-dock'
import { cx } from '@/components/ui/cx'

import { useRoomSession } from '../room-session'
import { DrawerCanvas, ReadOnlyCanvas } from '../shared/room-canvas'
import { BannerDetail, NoteBanner, WordBanner } from './banners'
import { DrawerToolbar } from './drawer-toolbar'
import { GuessFeed, LatestTeamGuess } from './guess-feed'
import { OpponentChip, OpponentTile } from './opponent-tile'
import { PlayLayout } from './play-layout'
import { Scoreboard } from './scoreboard'
import { useFreshFeedback } from './use-fresh-feedback'

/** The relay finale: each team redraws its own words, card after card. */
export function ShowdownScreen({
  showdown,
}: {
  readonly showdown: ShowdownView
}) {
  const { actions } = useRoomSession()
  const [watching, setWatching] = useState(false)
  const feedback = useFreshFeedback()
  const tools = useDrawingTools()
  const mine = showdown.mine
  const opponent = showdown.opponent
  if (!mine || !opponent) return null

  const opponentName = TEAM_NAMES[opponent.team]
  const rules = `Relay: redraw your team’s words. +${showdown.pointsPerCard} per card, +${showdown.finishBonus} for the first team to finish.`
  const watchingOpponent = watching && opponent.canvasAccess === 'full'
  const drawing = mine.canDraw && !watchingOpponent
  const firstClear = showdown.firstClearTeam === mine.team
  const opponentStatus = `${opponent.cleared}/${opponent.cardCount} cards`

  const banner =
    mine.amDrawer && mine.word && !mine.finished ? (
      <WordBanner
        term={mine.word.term}
        difficulty={mine.word.difficulty}
        // Showdown cards score a flat +pointsPerCard (stated in the note),
        // never the round's difficulty bonus.
        showBonus={false}
        note={`Card ${mine.cardIndex + 1} of ${mine.cardCount} · ${rules}`}
      />
    ) : (
      <NoteBanner tone={mine.finished ? 'dark' : 'plain'}>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 font-black">
            <CardPips cleared={mine.cleared} count={mine.cardCount} />
            <span className="truncate" data-testid="showdown-progress">
              {mine.finished
                ? `All ${mine.cardCount} cards cleared!${firstClear ? ` +${showdown.finishBonus} for finishing first` : ''}`
                : `Card ${mine.cardIndex + 1} of ${mine.cardCount} · ${mine.drawerName ?? 'Someone'} is drawing`}
            </span>
          </p>
          <BannerDetail
            className={cx(
              'line-clamp-2 text-xs font-semibold',
              mine.finished ? 'text-white/70' : 'text-black/55',
            )}
          >
            {rules}
          </BannerDetail>
        </div>
      </NoteBanner>
    )

  const canvas = watchingOpponent ? (
    <ReadOnlyCanvas
      canvasId={opponent.canvasId}
      label={`${opponentName}'s showdown drawing`}
      className="size-full"
      testId="team-canvas"
    />
  ) : drawing ? (
    <DrawerCanvas
      key={mine.canvasId}
      canvasId={mine.canvasId}
      label="Your canvas. Redraw this card."
      tool={tools.tool}
      color={tools.color}
      width={tools.width}
      className="size-full"
      testId="team-canvas"
    />
  ) : (
    <ReadOnlyCanvas
      canvasId={mine.canvasId}
      label={`${mine.drawerName ?? 'Your team'}'s showdown drawing`}
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
                  done={opponent.finished}
                  status={opponentStatus}
                />
              }
              disabledReason={
                mine.canGuess
                  ? null
                  : mine.finished
                    ? 'Your team is done. Cheer them on!'
                    : 'Guessing is closed.'
              }
            />
          </div>
        )
      }
      feed={
        <GuessFeed
          guesses={mine.guesses}
          label="Guesses for this card"
          emptyText={
            mine.amDrawer
              ? 'Your team’s guesses show up here.'
              : 'Guess the card!'
          }
        />
      }
      opponent={
        <OpponentTile
          team={opponent.team}
          canvasId={opponent.canvasId}
          access={opponent.canvasAccess}
          drawerName={opponent.drawerName}
          done={opponent.finished}
          status={opponentStatus}
          watching={watchingOpponent}
          onToggleWatch={() => setWatching((value) => !value)}
        />
      }
      aside={<Scoreboard />}
    />
  )
}

function CardPips({
  cleared,
  count,
}: {
  readonly cleared: number
  readonly count: number
}) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-0.5">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cx(
            'block size-2.5 rounded-full border border-current',
            index < cleared
              ? 'bg-[#1f9d72]'
              : index === cleared
                ? 'bg-current'
                : 'opacity-40',
          )}
        />
      ))}
    </span>
  )
}
