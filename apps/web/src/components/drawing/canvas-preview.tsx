'use client'

import { useEffect, useRef } from 'react'

import { cx } from '../ui/cx'

export interface PreviewGrid {
  readonly cols: number
  readonly rows: number
  /** Row-major `#rrggbb` ink per cell, or null for empty paper. */
  readonly cells: readonly (string | null)[]
}

export interface CanvasPreviewProps {
  readonly preview: PreviewGrid | null
  readonly label?: string
  readonly className?: string
}

const PAPER = '#fffdf7'

/**
 * The opponent's drawing as a handful of big blurry blocks: enough to see
 * that they are busy (and roughly in which color), never enough to help.
 * The grid itself comes from the server; raw strokes never reach this tab.
 */
export function CanvasPreview({
  preview,
  label = 'Opponent',
  className,
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !preview) return
    canvas.width = preview.cols
    canvas.height = preview.rows
    context.fillStyle = PAPER
    context.fillRect(0, 0, preview.cols, preview.rows)
    preview.cells.forEach((cell, index) => {
      if (!cell) return
      context.fillStyle = cell
      context.fillRect(
        index % preview.cols,
        Math.floor(index / preview.cols),
        1,
        1,
      )
    })
  }, [preview])

  const inked = preview?.cells.filter(Boolean).length ?? 0
  return (
    <figure
      className={cx(
        'relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-[#181713] bg-[#ded8cc]',
        className,
      )}
    >
      {preview ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${label}'s drawing, blurred on purpose`}
          className="absolute -left-[8%] -top-[8%] h-[116%] w-[116%] blur-[3px] saturate-150"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <div
          role="img"
          aria-label={`${label} has not started drawing`}
          className="absolute inset-0 grid grid-cols-8 grid-rows-6 gap-1 p-2 blur-[2px]"
        >
          {Array.from({ length: 48 }, (_, index) => (
            <span
              key={index}
              className={cx(
                'animate-pulse rounded-sm',
                index % 7 === 0
                  ? 'bg-[#5c4cf2]/30'
                  : index % 5 === 0
                    ? 'bg-[#ff6b4a]/30'
                    : 'bg-white/50',
              )}
              style={{ animationDelay: `${(index % 6) * 120}ms` }}
            />
          ))}
        </div>
      )}
      <figcaption className="absolute left-2 top-2 rounded-full bg-[#181713]/85 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
        {label}
        {preview && inked === 0 ? ' · blank' : ''}
      </figcaption>
    </figure>
  )
}
