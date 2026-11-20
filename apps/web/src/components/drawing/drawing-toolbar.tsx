'use client'

import type { DrawingAction } from '@drawing-games/drawing-model'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'

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

/**
 * - `strip`: one row (desktop; wraps when the host allows).
 * - `rows`: portrait phones, two rows under the canvas.
 * - `panel`: a narrow sidebar (landscape phones).
 */
export type DrawingToolbarLayout = 'strip' | 'rows' | 'panel'

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
  readonly layout?: DrawingToolbarLayout
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
  layout = 'strip',
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

  const penButton = (
    <IconButton
      label="Pen (B)"
      pressed={tool === 'pen'}
      onClick={() => onToolChange('pen')}
    >
      <PenIcon />
    </IconButton>
  )
  const eraserButton = (
    <IconButton
      label="Eraser: tap a stroke to remove it (E)"
      pressed={tool === 'eraser'}
      onClick={() => onToolChange('eraser')}
    >
      <EraserIcon />
    </IconButton>
  )
  const undoButton = (
    <IconButton
      label="Undo (Ctrl+Z)"
      disabled={!canUndo || disabled}
      onClick={undo}
    >
      <UndoIcon />
    </IconButton>
  )
  const redoButton = (
    <IconButton
      label="Redo (Ctrl+Shift+Z)"
      disabled={!canRedo || disabled}
      onClick={redo}
    >
      <RedoIcon />
    </IconButton>
  )
  const clearButton = (
    <button
      type="button"
      disabled={!canClear || disabled}
      aria-label={
        confirmingClear ? 'Tap again to clear the canvas' : 'Clear canvas'
      }
      title={confirmingClear ? 'Tap again to clear' : 'Clear canvas'}
      onClick={() => {
        if (!confirmingClear) {
          setConfirmingClear(true)
          return
        }
        setConfirmingClear(false)
        onOps([{ type: 'drawing.clear' }])
      }}
      className={cx(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-black transition disabled:pointer-events-none disabled:opacity-35',
        layout === 'panel' ? 'px-2' : 'px-3',
        confirmingClear
          ? 'border-[#181713] bg-[#ff6b4a] text-[#181713] shadow-[2px_2px_0_#181713]'
          : 'border-transparent bg-black/5 hover:bg-black/10',
      )}
    >
      <TrashIcon width={18} height={18} />
      <span
        className={cx(
          layout === 'panel' && 'sr-only',
          // Tiny phones: icon only, so the row never needs a sideways scroll.
          layout === 'rows' && 'hidden @min-[22rem]:inline',
        )}
      >
        {confirmingClear ? 'Tap again' : 'Clear'}
      </span>
    </button>
  )
  const status = (
    <span className="sr-only" aria-live="polite">
      {`Selected: ${tool === 'pen' ? `pen, ${colorName(color)}` : 'eraser'}`}
    </span>
  )
  const toolbarProps = {
    role: 'toolbar',
    'aria-label': 'Drawing tools',
    'aria-disabled': disabled || undefined,
    'data-layout': layout,
  } as const

  if (layout !== 'strip') {
    // Phones: every tool is on screen at once, with no hidden sideways
    // scroll. Row one holds pen, eraser, size, undo, redo and clear; the
    // colors share a grid below. Sizes open from a small popover.
    const panel = layout === 'panel'
    return (
      <div
        {...toolbarProps}
        className={cx(
          'relative flex min-w-0 flex-col @container',
          panel ? 'gap-1.5 p-2' : 'gap-1 px-2 py-1',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
      >
        {panel ? (
          <>
            <div className="flex items-center justify-between gap-1">
              {penButton}
              {eraserButton}
              <SizePicker
                width={width}
                color={color}
                tool={tool}
                onWidthChange={onWidthChange}
                popoverClassName="top-[3.25rem] left-2 right-2"
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {undoButton}
              {redoButton}
              {clearButton}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            {penButton}
            {eraserButton}
            <SizePicker
              width={width}
              color={color}
              tool={tool}
              onWidthChange={onWidthChange}
              popoverClassName="bottom-full left-2 mb-1"
            />
            <span className="min-w-0 flex-1" />
            {undoButton}
            {redoButton}
            {clearButton}
          </div>
        )}
        <ColorGrid
          color={color}
          tool={tool}
          onColorChange={onColorChange}
          className={panel ? 'grid-cols-6' : 'grid-cols-12'}
        />
        {status}
      </div>
    )
  }

  return (
    <div
      {...toolbarProps}
      className={cx(
        'flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {penButton}
      {eraserButton}

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
              aria-label={swatchLabel(swatch.name, index)}
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

      <SizeButtons
        width={width}
        color={color}
        tool={tool}
        onWidthChange={onWidthChange}
      />

      <Divider />

      {undoButton}
      {redoButton}
      {clearButton}
      {status}
    </div>
  )
}

function swatchLabel(name: string, index: number): string {
  return `${name}${index < 9 ? ` (${index + 1})` : ''}`
}

interface SizeProps {
  readonly width: number
  readonly color: string
  readonly tool: DrawingTool
  readonly onWidthChange: (width: number) => void
}

function SizeDot({
  index,
  color,
  tool,
}: {
  readonly index: number
  readonly color: string
  readonly tool: DrawingTool
}) {
  return (
    <span
      aria-hidden="true"
      className="block rounded-full"
      style={{
        width: 4 + index * 5,
        height: 4 + index * 5,
        backgroundColor: tool === 'pen' ? color : '#181713',
        boxShadow:
          color.toLowerCase() === '#ffffff' ? '0 0 0 1.5px #181713' : undefined,
      }}
    />
  )
}

function SizeButtons({
  width,
  color,
  tool,
  onWidthChange,
  onPicked,
}: SizeProps & { readonly onPicked?: () => void }) {
  return (
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
          onClick={() => {
            onWidthChange(size.value)
            onPicked?.()
          }}
          className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-transparent transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35 aria-pressed:border-[#181713] aria-pressed:bg-white"
        >
          <SizeDot index={index} color={color} tool={tool} />
        </button>
      ))}
    </div>
  )
}

/**
 * One button showing the current stroke size; it opens the four sizes in a
 * small popover (positioned against the toolbar by `popoverClassName`).
 */
function SizePicker({
  popoverClassName,
  ...sizeProps
}: SizeProps & { readonly popoverClassName: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const index = Math.max(
    0,
    STROKE_SIZES.findIndex((size) => size.value === sizeProps.width),
  )
  const current = STROKE_SIZES[index]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    // `contents`: the popover positions against the toolbar, not this box,
    // while staying next to its button in the tab order.
    <div ref={rootRef} className="contents">
      <IconButton
        label={`Stroke size: ${current?.name ?? 'Medium'}`}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
        className={open ? 'border-[#181713]! bg-white!' : undefined}
      >
        <SizeDot index={index} color={sizeProps.color} tool={sizeProps.tool} />
      </IconButton>
      {open ? (
        <div
          id={popoverId}
          className={cx(
            'absolute z-30 flex w-max justify-center rounded-2xl border-2 border-[#181713] bg-[#fffdf7] p-1 shadow-[3px_3px_0_#181713]',
            popoverClassName,
          )}
        >
          <SizeButtons {...sizeProps} onPicked={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  )
}

/** Colors as an evenly spread grid (phones), all visible at once. */
function ColorGrid({
  color,
  tool,
  onColorChange,
  className,
}: {
  readonly color: string
  readonly tool: DrawingTool
  readonly onColorChange: (color: string) => void
  readonly className: string
}) {
  return (
    <div
      role="group"
      aria-label="Ink color"
      className={cx('grid gap-0.5', className)}
    >
      {DRAWING_COLORS.map((swatch, index) => {
        const selected = swatch.value === color && tool === 'pen'
        return (
          <button
            key={swatch.value}
            type="button"
            aria-pressed={swatch.value === color}
            aria-label={swatchLabel(swatch.name, index)}
            title={swatch.name}
            onClick={() => onColorChange(swatch.value)}
            className="grid h-9 min-w-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c4cf2]/35"
          >
            <span
              className={cx(
                'block size-6 rounded-full border-2 border-[#181713]',
                selected &&
                  'ring-2 ring-[#181713] ring-offset-2 ring-offset-[#fffdf7]',
              )}
              style={{ backgroundColor: swatch.value }}
            />
          </button>
        )
      })}
    </div>
  )
}

function Divider() {
  return (
    <span aria-hidden="true" className="mx-0.5 h-8 w-px shrink-0 bg-black/15" />
  )
}
