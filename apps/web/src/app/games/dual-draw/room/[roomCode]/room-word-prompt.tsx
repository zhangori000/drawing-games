import type { PlaytestWordView } from '@/lib/playtest-room-contract'

interface RoomWordPromptProps {
  readonly teamName: string
  readonly word: PlaytestWordView
}

export function RoomWordPrompt({ teamName, word }: RoomWordPromptProps) {
  const drawerCanSeeWord = word.visibility === 'drawer-only'

  return (
    <section
      aria-labelledby="round-prompt-heading"
      className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-b-2 border-black/10 bg-white/75 px-4 py-3 sm:px-5"
    >
      <div className="min-w-0">
        <h2
          id="round-prompt-heading"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45"
        >
          {drawerCanSeeWord ? 'Your final word' : 'Guessing clue'}
        </h2>
        {drawerCanSeeWord ? (
          <output
            aria-labelledby="round-prompt-heading"
            data-testid="final-word"
            className="mt-1 block truncate text-2xl font-black tracking-tight text-[#5c4cf2] sm:text-3xl"
          >
            {word.value}
          </output>
        ) : (
          <output
            aria-labelledby="round-prompt-heading"
            data-testid="word-length"
            className="mt-1 block text-xl font-black tracking-tight sm:text-2xl"
          >
            {word.length} letters
          </output>
        )}
      </div>
      <p className="max-w-52 text-right text-xs leading-5 text-black/50">
        {drawerCanSeeWord
          ? `Only the ${teamName} drawer receives this value.`
          : 'The final word is not sent to this browser.'}
      </p>
    </section>
  )
}
