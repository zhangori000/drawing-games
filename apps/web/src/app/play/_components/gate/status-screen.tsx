import Link from 'next/link'
import type { ReactNode } from 'react'

import { Spinner } from '@/components/ui/button'
import { cx } from '@/components/ui/cx'

import { ScrollPane } from '../shared/layout'

export interface StatusScreenProps {
  readonly title: string
  readonly children?: ReactNode
  /** Buttons/links under the message. */
  readonly actions?: ReactNode
  readonly tone?: 'plain' | 'warn'
  readonly busy?: boolean
  readonly roomCode: string
}

/**
 * Full-screen card for every non-playing state (connecting, join, not
 * found, full, replaced). Scrolls inside the play viewport if it must.
 */
export function StatusScreen({
  title,
  children,
  actions,
  tone = 'plain',
  busy = false,
  roomCode,
}: StatusScreenProps) {
  return (
    <ScrollPane className="px-4 py-6 sm:py-10">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-black/60 hover:bg-black/5 hover:text-black"
          >
            <span aria-hidden="true">←</span> Home
          </Link>
          <span className="rounded-full border-2 border-[#181713] bg-white px-3 py-1 font-mono text-sm font-black tracking-[0.2em]">
            {roomCode}
          </span>
        </div>
        <section
          aria-labelledby="status-title"
          className={cx(
            'rounded-3xl border-2 border-[#181713] p-6 shadow-[6px_6px_0_#181713] sm:p-8',
            tone === 'warn' ? 'bg-[#fff1c2]' : 'bg-[#fffdf7]',
          )}
        >
          <h1
            id="status-title"
            className="flex items-center gap-3 text-3xl font-black tracking-[-0.04em]"
          >
            {busy ? <Spinner className="size-6" /> : null}
            {title}
          </h1>
          {children ? (
            <div className="mt-3 leading-7 text-black/65">{children}</div>
          ) : null}
          {actions ? (
            <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
          ) : null}
        </section>
      </div>
    </ScrollPane>
  )
}
