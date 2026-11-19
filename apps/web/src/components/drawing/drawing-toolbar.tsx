'use client'

import type { DrawingAction } from '@drawing-games/drawing-model'
import { useEffect, useEffectEvent, useState } from 'react'

import { isEditableElement, isModalOpen } from '../layout/editable'
import { cx } from '../ui/cx'
import { IconButton } from '../ui/icon-button'
import { EraserIcon, PenIcon, RedoIcon, TrashIcon, UndoIcon } from '../ui/icons'
import {
  DRAWING_COLORS,
  STROKE_SIZES,
  colorName,
  type DrawingTool,
} from './palette'

export interface DrawingToolbarProps {
  readonly tool: DrawingTool
  readonly onToolChange: (tool: DrawingTool) => void
  readonly color: string
  readonly onColorChange: (color: string) => void
  readonly width: number
  readonly onWidthChange: (width: number) => void
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly canClear: boolean
  /** Undo/redo/clear travel the same path as strokes. */
  readonly onOps: (ops: DrawingAction[]) => void
  /** Keyboard shortcuts (B/E, 1–9, [ ], undo/redo). Default on. */
  readonly shortcuts?: boolean
  readonly disabled?: boolean
  readonly className?: string
}

const CLEAR_CONFIRM_MS = 3000

export function DrawingToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  canUndo,
  canRedo,
  canClear,
  onOps,
  shortcuts = true,
  disabled = false,
  className,
}: DrawingToolbarProps) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    if (!confirmingClear) return
    const id = window.setTimeout(
      () => setConfirmingClear(false),
      CLEAR_CONFIRM_MS,
    )
    return () => window.clearTimeout(id)
  }, [confirmingClear])

  const undo = () => {
    if (canUndo && !disabled) onOps([{ type: 'drawing.undo' }])
  }
  const redo = () => {
    if (canRedo && !disabled) onOps([{ type: 'drawing.redo' }])
  }
  const stepSize = (direction: -1 | 1) => {
    const index = STROKE_SIZES.findIndex((size) => size.value === width)
    const next =
      STROKE_SIZES[
        Math.min(STROKE_SIZES.length - 1, Math.max(0, index + direction))
      ]
    if (next) onWidthChange(next.value)
  }

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!shortcuts || disabled || event.defaultPrevented) return
    if (
      isEditableElement(event.target) ||
      isEditableElement(document.activeElement)
    )
      return
    if (isModalOpen()) return

    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const isRedo =
        (key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')
      if (isRedo) {
        event.preventDefault()
        redo()
      } else if (key === 'z') {
        event.preventDefault()
        undo()
      }
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (key === 'b') onToolChange('pen')
    else if (key === 'e') onToolChange('eraser')
    else if (key === '[') stepSize(-1)
    else if (key === ']') stepSize(1)
    else if (/^[1-9]$/.test(key)) {
      const swatch = DRAWING_COLORS[Number(key) - 1]
      if (swatch) onColorChange(swatch.value)
    } else return
    event.preventDefault()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-disabled={disabled || undefined}
      className={cx(
        'flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <IconButton
        label="Pen (B)"
        pressed={tool === 'pen'}
        onClick={() => onToolChange('pen')}
      >
        <PenIcon />
      </IconButton>
      <IconButton
        label="Eraser: tap a stroke to remove it (E)"
        pressed={tool === 'eraser'}
        onClick={() => onToolChange('eraser')}
      >
        <EraserIcon />
      </IconButton>

      <Divider />

      <div
        role="group"
        aria-label="Ink color"
        className="flex shrink-0 items-center gap-0.5"
      >
        {DRAWING_COLORS.map((swatch, index) => {
          const selected = swatch.value === color && tool === 'pen'
          return (
            <button
              key={swatch.value}
              type="button"
              aria-pressed={swatch.value === color}
              aria-label={`${swatch.name}${index < 9 ? ` (${index + 1})` : ''}`}
              title={swatch.name}
              onClick={() => onColorChange(swatch.value)}
              className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35"
            >
              <span
                className={cx(
                  'block rounded-full border-2 border-[#181713] transition-transform',
                  selected
                    ? 'size-8 scale-100 ring-2 ring-[#181713] ring-offset-2 ring-offset-[#f5f0e8]'
                    : 'size-7',
                )}
                style={{ backgroundColor: swatch.value }}
              />
            </button>
          )
        })}
      </div>

      <Divider />

      <div
        role="group"
        aria-label="Stroke size"
        className="flex shrink-0 items-center gap-0.5"
      >
        {STROKE_SIZES.map((size, index) => (
          <button
            key={size.value}
            type="button"
            aria-pressed={size.value === width}
            aria-label={`${size.name} stroke`}
            title={`${size.name} ([ and ] change size)`}
            onClick={() => onWidthChange(size.value)}
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-transparent transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35 aria-pressed:border-[#181713] aria-pressed:bg-white"
          >
            <span
              className="block rounded-full"
              style={{
                width: 4 + index * 5,
                height: 4 + index * 5,
                backgroundColor: tool === 'pen' ? color : '#181713',
                boxShadow:
                  color.toLowerCase() === '#ffffff'
                    ? '0 0 0 1.5px #181713'
                    : undefined,
              }}
            />
          </button>
        ))}
      </div>

      <Divider />

      <IconButton
        label="Undo (Ctrl+Z)"
        disabled={!canUndo || disabled}
        onClick={undo}
      >
        <UndoIcon />
      </IconButton>
      <IconButton
        label="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo || disabled}
        onClick={redo}
      >
        <RedoIcon />
      </IconButton>
      <button
        type="button"
        disabled={!canClear || disabled}
        aria-label={
          confirmingClear ? 'Tap again to clear the canvas' : 'Clear canvas'
        }
        onClick={() => {
          if (!confirmingClear) {
            setConfirmingClear(true)
            return
          }
          setConfirmingClear(false)
          onOps([{ type: 'drawing.clear' }])
        }}
        className={cx(
          'flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-black transition disabled:pointer-events-none disabled:opacity-35',
          confirmingClear
            ? 'border-[#181713] bg-[#ff6b4a] text-white shadow-[2px_2px_0_#181713]'
            : 'border-transparent bg-black/5 hover:bg-black/10',
        )}
      >
        <TrashIcon width={18} height={18} />
        {confirmingClear ? 'Tap again' : 'Clear'}
      </button>
      <span className="sr-only" aria-live="polite">
        {`Selected: ${tool === 'pen' ? `pen, ${colorName(color)}` : 'eraser'}`}
      </span>
    </div>
  )
}

function Divider() {
  return (
    <span aria-hidden="true" className="mx-0.5 h-8 w-px shrink-0 bg-black/15" />
  )
}
