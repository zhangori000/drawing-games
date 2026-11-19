'use client'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'

import {
  useSettingsDraft,
  type SettingsDraft,
} from '../../_lib/use-settings-draft'
import { useMembers, useRoomSession } from '../room-session'
import { Eyebrow, ScrollPane } from '../shared/layout'
import { useInviteLink } from '../top-bar'
import { SettingsPanel } from './settings-panel'
import { TeamPanel } from './team-panel'

/** Teams, host tools, and settings; the primary action stays docked below. */
export function LobbyScreen() {
  const { view, me, actions } = useRoomSession()
  const draft = useSettingsDraft(view.settings, actions.updateSettings)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollPane>
        <div className="mx-auto grid w-full max-w-5xl gap-5 px-3 py-4 sm:px-5 sm:py-6">
          <InviteCard />
          <Teams />
          <SettingsPanel draft={draft} editable={me.isHost} />
        </div>
      </ScrollPane>
      <LobbyActionBar draft={draft} />
    </div>
  )
}

function InviteCard() {
  const { roomCode, view } = useRoomSession()
  const link = useInviteLink(roomCode)
  const humans = view.members.filter((member) => member.kind === 'human').length
  return (
    <section
      aria-labelledby="invite-heading"
      className="flex flex-wrap items-center gap-4 rounded-3xl border-2 border-[#181713] bg-[#181713] p-4 text-white shadow-[4px_4px_0_#5c4cf2] sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <Eyebrow className="text-white/60">Invite friends</Eyebrow>
        <h2
          id="invite-heading"
          className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"
        >
          <span className="font-mono text-4xl font-black tracking-[0.2em] text-[#f8ff80]">
            {roomCode}
          </span>
          <span className="text-sm font-semibold text-white/70">
            {humans === 1 ? 'Just you so far' : `${humans} players here`}
          </span>
        </h2>
        <p className="mt-1 truncate text-xs text-white/55">{link}</p>
      </div>
      <CopyButton
        text={link}
        label="Copy invite link"
        variant="lime"
        size="md"
      />
    </section>
  )
}

function Teams() {
  const { me, actions, pending } = useRoomSession()
  return (
    <section aria-labelledby="teams-heading" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <Eyebrow>Teams</Eyebrow>
          <h2
            id="teams-heading"
            className="text-2xl font-black tracking-[-0.03em]"
          >
            Sun vs Moon
          </h2>
        </div>
        {me.isHost ? (
          <Button
            size="sm"
            variant="secondary"
            loading={pending.has('shuffle')}
            onClick={() => void pending.run('shuffle', () => actions.shuffle())}
          >
            Shuffle teams
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TeamPanel team="A" />
        <TeamPanel team="B" />
      </div>
    </section>
  )
}

function LobbyActionBar({ draft }: { readonly draft: SettingsDraft }) {
  const { view, me, actions, pending } = useRoomSession()
  const { byId } = useMembers()
  const lobby = view.lobby
  const self = byId.get(me.memberId)
  const ready = self?.ready ?? false
  const blockers = lobby?.blockers ?? []
  const host = view.hostId ? byId.get(view.hostId) : undefined

  const start = () =>
    pending.run('start', async () => {
      // Make sure the latest settings edit reaches the room first.
      await draft.flush()
      await actions.start()
    })

  return (
    <div className="shrink-0 border-t-2 border-[#181713] bg-[#fffdf7] px-3 py-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          {blockers.length > 0 ? (
            <ul
              className="grid gap-0.5 text-sm font-semibold text-black/65"
              data-testid="lobby-blockers"
            >
              {blockers.slice(0, 3).map((blocker) => (
                <li key={blocker} className="flex gap-1.5">
                  <span aria-hidden="true">•</span>
                  {blocker}
                </li>
              ))}
              {blockers.length > 3 ? (
                <li className="text-black/45">+{blockers.length - 3} more</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-sm font-black text-[#0d5c41]">
              {me.isHost
                ? 'Everyone’s set. Start when you like!'
                : `Waiting for ${host?.displayName ?? 'the host'} to start.`}
            </p>
          )}
        </div>
        {me.isHost ? (
          <Button
            size="lg"
            variant="success"
            disabled={!lobby?.canStart}
            data-testid="lobby-start"
            loading={pending.has('start')}
            onClick={() => void start()}
          >
            Start match
          </Button>
        ) : (
          <Button
            size="lg"
            variant={ready ? 'secondary' : 'success'}
            aria-pressed={ready}
            data-testid="lobby-ready"
            loading={pending.has('ready')}
            onClick={() =>
              void pending.run('ready', () => actions.setReady(!ready))
            }
          >
            {ready ? '✓ Ready — tap to undo' : 'I’m ready'}
          </Button>
        )}
      </div>
    </div>
  )
}
