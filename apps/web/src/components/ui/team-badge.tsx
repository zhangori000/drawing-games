import { TEAM_NAMES, type TeamId } from '@drawing-games/game-core'

import { cx } from './cx'

export const TEAM_COLORS: Readonly<Record<TeamId, string>> = {
  A: '#ff6b4a',
  B: '#5c4cf2',
}

export const TEAM_SYMBOLS: Readonly<Record<TeamId, string>> = {
  A: '☀',
  B: '☾',
}

export interface TeamBadgeProps {
  readonly team: TeamId
  readonly size?: 'sm' | 'md'
  /** Text after the team name, e.g. a score. */
  readonly suffix?: string
  readonly className?: string
}

/** Team Sun (coral) or Team Moon (violet). */
export function TeamBadge({
  team,
  size = 'md',
  suffix,
  className,
}: TeamBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#181713] font-black text-white',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className,
      )}
      style={{ backgroundColor: TEAM_COLORS[team] }}
    >
      <span aria-hidden="true">{TEAM_SYMBOLS[team]}</span>
      {TEAM_NAMES[team]}
      {suffix ? <span className="font-mono tabular-nums">{suffix}</span> : null}
    </span>
  )
}
