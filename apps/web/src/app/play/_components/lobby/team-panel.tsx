'use client'

import {
  MAX_MEMBERS_PER_TEAM,
  MIN_MEMBERS_PER_TEAM,
  TEAM_NAMES,
  otherTeam,
  type MemberView,
  type TeamId,
} from '@drawing-games/game-core'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'
import { IconButton } from '@/components/ui/icon-button'
import { Modal } from '@/components/ui/modal'
import { TEAM_COLORS, TeamBadge } from '@/components/ui/team-badge'

import { useMembers, useRoomSession } from '../room-session'

/** One team's roster with join/host controls. */
export function TeamPanel({ team }: { readonly team: TeamId }) {
  const { me, actions, pending } = useRoomSession()
  const members = useMembers().team(team)
  const full = members.length >= MAX_MEMBERS_PER_TEAM
  const mine = me.team === team
  const headingId = `team-${team}-heading`
  // A person removed by mistake has to join again and ready up, so the host
  // confirms first; a bot goes at once (adding one back is a single tap).
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const confirmRemove =
    members.find((member) => member.id === confirmRemoveId) ?? null
  const remove = (member: MemberView) =>
    void pending.run(`remove-${member.id}`, () =>
      actions.removeMember(member.id),
    )

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-3xl border-2 border-[#181713] bg-[#fffdf7] shadow-[4px_4px_0_#181713]"
    >
      <header
        className="flex flex-wrap items-center gap-2 rounded-t-[1.35rem] border-b-2 border-[#181713] px-4 py-3"
        style={{ backgroundColor: `${TEAM_COLORS[team]}22` }}
      >
        <h2 id={headingId} className="flex items-center gap-2">
          <TeamBadge team={team} />
          <span className="font-mono text-sm font-black tabular-nums text-black/60">
            {members.length}/{MAX_MEMBERS_PER_TEAM}
          </span>
          {mine ? (
            <span className="text-xs font-bold text-black/55">Your team</span>
          ) : null}
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          {!mine ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={full}
              loading={pending.has(`team-${team}`)}
              onClick={() =>
                void pending.run(`team-${team}`, () => actions.setTeam(team))
              }
            >
              {full ? 'Team full' : `Join ${TEAM_NAMES[team]}`}
            </Button>
          ) : null}
          {me.isHost ? (
            <Button
              size="sm"
              variant="dark"
              disabled={full}
              loading={pending.has(`bot-${team}`)}
              onClick={() =>
                void pending.run(`bot-${team}`, () => actions.addBot(team))
              }
            >
              <span aria-hidden="true">+</span> Add bot
              <span className="sr-only"> to {TEAM_NAMES[team]}</span>
            </Button>
          ) : null}
        </div>
      </header>
      <ul className="grid gap-1 p-2" aria-label={`${TEAM_NAMES[team]} players`}>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onRemove={() =>
              member.kind === 'bot'
                ? remove(member)
                : setConfirmRemoveId(member.id)
            }
          />
        ))}
        {members.length < MIN_MEMBERS_PER_TEAM ? (
          <li className="rounded-2xl border-2 border-dashed border-black/20 px-3 py-3 text-sm text-black/50">
            {members.length === 0
              ? `Nobody on ${TEAM_NAMES[team]} yet.`
              : `${TEAM_NAMES[team]} needs ${MIN_MEMBERS_PER_TEAM - members.length} more.`}
            {me.isHost ? ' Invite a friend or add a bot.' : ''}
          </li>
        ) : null}
      </ul>
      {me.isHost ? (
        <Modal
          open={confirmRemove !== null}
          onClose={() => setConfirmRemoveId(null)}
          title={`Remove ${confirmRemove?.displayName ?? 'this player'}?`}
          description={
            confirmRemove
              ? `${confirmRemove.displayName} leaves the room at once. To come back, they join again with the room code and ready up.`
              : undefined
          }
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setConfirmRemoveId(null)}
              >
                Keep
              </Button>
              <Button
                variant="accent"
                onClick={() => {
                  setConfirmRemoveId(null)
                  if (confirmRemove) remove(confirmRemove)
                }}
              >
                Remove
              </Button>
            </>
          }
        />
      ) : null}
    </section>
  )
}

function MemberRow({
  member,
  onRemove,
}: {
  readonly member: MemberView
  /** Removes a bot at once; asks first for a person. */
  readonly onRemove: () => void
}) {
  const { me, actions, pending } = useRoomSession()
  const isMe = member.id === me.memberId
  const bot = member.kind === 'bot'
  const target = otherTeam(member.team)

  return (
    <li
      data-testid="lobby-member"
      data-kind={member.kind}
      className={cx(
        'flex min-h-12 items-center gap-2 rounded-2xl px-2 py-1.5',
        isMe && 'bg-[#f8ff80]/60',
        !member.connected && 'opacity-55',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[#181713] text-sm font-black text-white"
        style={{ backgroundColor: TEAM_COLORS[member.team] }}
      >
        {bot ? '🤖' : member.displayName.slice(0, 1).toUpperCase() || '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-black">{member.displayName}</span>
          {isMe ? (
            <span className="shrink-0 text-xs font-bold text-black/50">
              (you)
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-1 pt-0.5">
          {member.isHost ? <Tag tone="lime">👑 Host</Tag> : null}
          {bot ? <Tag tone="ink">Bot</Tag> : null}
          {member.hasAccount ? <Tag tone="violet">Stats saved</Tag> : null}
          {!member.connected ? <Tag tone="plain">Offline</Tag> : null}
        </span>
      </span>
      {bot || member.isHost ? null : (
        <span
          className={cx(
            'shrink-0 rounded-full border-2 px-2 py-0.5 text-xs font-black',
            member.ready
              ? 'border-[#181713] bg-[#1f9d72] text-white'
              : 'border-black/15 text-black/50',
          )}
        >
          {member.ready ? '✓ Ready' : 'Not ready'}
        </span>
      )}
      {me.isHost && !isMe ? (
        <span className="flex shrink-0 gap-1">
          <IconButton
            label={`Move ${member.displayName} to ${TEAM_NAMES[target]}`}
            disabled={pending.has(`move-${member.id}`)}
            onClick={() =>
              void pending.run(`move-${member.id}`, () =>
                actions.setTeam(target, member.id),
              )
            }
          >
            <span aria-hidden="true" className="text-lg font-black">
              ⇄
            </span>
          </IconButton>
          <IconButton
            label={`Remove ${member.displayName}`}
            disabled={pending.has(`remove-${member.id}`)}
            onClick={onRemove}
          >
            <span
              aria-hidden="true"
              className="text-xl font-black leading-none"
            >
              ×
            </span>
          </IconButton>
        </span>
      ) : null}
    </li>
  )
}

const TAG_TONES = {
  lime: 'border-[#181713] bg-[#f8ff80] text-[#181713]',
  ink: 'border-[#181713] bg-[#181713] text-white',
  violet: 'border-[#5c4cf2] bg-[#ded9ff] text-[#2d2190]',
  plain: 'border-black/20 bg-white text-black/60',
} as const

function Tag({
  tone,
  children,
}: {
  readonly tone: keyof typeof TAG_TONES
  readonly children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-1.5 text-[10px] font-black uppercase tracking-wider',
        TAG_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}
