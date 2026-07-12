'use client'

import type {
  DrawingAction,
  DrawingDocument,
  StrokeStyle,
} from '@drawing-games/drawing-model'
import {
  DrawingPad,
  type DrawingPadHandle,
  type DrawingPadStatus,
  type DrawingTool,
} from '@/components/drawing'
import { useEffect, useRef, useState } from 'react'

import type { DrawingSocketStatus } from '@/lib/room-drawing-socket'

import type { PlaytestTeamId } from '@/lib/playtest-room-contract'

interface RoomStageProps {
  readonly teamId: PlaytestTeamId
  readonly teamName: string
  readonly drawing: DrawingDocument
  readonly serverCanUndo: boolean
  readonly serverCanRedo: boolean
  readonly showTools: boolean
  readonly editable: boolean
  readonly socketStatus: DrawingSocketStatus
  readonly socketError: string | null
  readonly opponentActive: boolean
  readonly onOperations: (operations: readonly DrawingAction[]) => boolean
}

const COLORS = ['#181713', '#5c4cf2', '#ff6b4a', '#1f9d72', '#f0b429']
const WIDTHS = [0.006, 0.012, 0.022] as const
const PIXEL_CELLS = Array.from({ length: 48 }, (_, index) => index)

export function RoomStage({
  teamId,
  teamName,
  drawing,
  serverCanUndo,
  serverCanRedo,
  showTools,
  editable,
  socketStatus,
  socketError,
  opponentActive,
  onOperations,
}: RoomStageProps) {
  const drawingPadRef = useRef<DrawingPadHandle>(null)
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [color, setColor] = useState(COLORS[1] ?? '#5c4cf2')
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(WIDTHS[1])
  const [drawingStatus, setDrawingStatus] = useState<DrawingPadStatus>({
    canRedo: false,
    canUndo: false,
    hasDrawing: drawing.strokeOrder.length > 0,
  })
  const [directEditPending, setDirectEditPending] = useState(false)
  const strokeStyle: StrokeStyle = { color, width, opacity: 1 }
  const controlsEditable = editable && !directEditPending

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setDirectEditPending(false)
    })

    return () => {
      active = false
    }
  }, [drawing, socketStatus])

  function submitDirectEdit(operation: DrawingAction) {
    if (onOperations([operation])) setDirectEditPending(true)
  }

  return (
    <section
      aria-label={`${teamName} drawing stage`}
      data-testid="drawing-stage"
      data-realtime-status={socketStatus}
      className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[#ded8cc]"
    >
      {showTools && (
        <fieldset
          disabled={!controlsEditable}
          aria-label="Drawing tools"
          className="flex min-w-0 items-center gap-2 overflow-x-auto border-b-2 border-black/10 bg-white/75 px-3 py-2"
        >
          <legend className="sr-only">Drawing tools</legend>
          <ToolButton
            active={tool === 'pen'}
            label="Pen"
            onClick={() => setTool('pen')}
          />
          <ToolButton
            active={tool === 'object-eraser'}
            label="Object erase"
            onClick={() => setTool('object-eraser')}
          />
          <Separator />

          {COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Use color ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => {
                setColor(swatch)
                setTool('pen')
              }}
              className="size-9 shrink-0 rounded-full border-2 border-[#181713] transition hover:scale-105 aria-pressed:ring-2 aria-pressed:ring-[#5c4cf2] aria-pressed:ring-offset-2"
              style={{ backgroundColor: swatch }}
            />
          ))}

          <Separator />
          {WIDTHS.map((strokeWidth, index) => (
            <button
              key={strokeWidth}
              type="button"
              aria-label={`Use ${['thin', 'medium', 'thick'][index]} stroke`}
              aria-pressed={width === strokeWidth}
              onClick={() => {
                setWidth(strokeWidth)
                setTool('pen')
              }}
              className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-transparent bg-black/5 transition hover:bg-black/10 aria-pressed:border-[#181713] aria-pressed:bg-white"
            >
              <span
                className="block rounded-full bg-[#181713]"
                style={{ width: 24, height: 2 + index * 4 }}
              />
            </button>
          ))}

          <Separator />
          <ToolButton
            disabled={!serverCanUndo}
            label="Undo"
            onClick={() => {
              if (drawingStatus.canUndo) drawingPadRef.current?.undo()
              else submitDirectEdit({ type: 'drawing.undo' })
            }}
          />
          <ToolButton
            disabled={!serverCanRedo}
            label="Redo"
            onClick={() => {
              if (drawingStatus.canRedo) drawingPadRef.current?.redo()
              else submitDirectEdit({ type: 'drawing.redo' })
            }}
          />
          <ToolButton
            disabled={!drawingStatus.hasDrawing}
            label="Clear"
            onClick={() => {
              if (window.confirm('Clear the canvas? You can still undo it.')) {
                drawingPadRef.current?.clear()
              }
            }}
          />
        </fieldset>
      )}

      <div className="relative min-h-0 p-2 sm:p-4">
        <div className="relative h-full min-h-36 overflow-hidden rounded-2xl border-2 border-[#181713] bg-white shadow-[4px_4px_0_#181713]">
          <DrawingPad
            ref={drawingPadRef}
            document={drawing}
            editable={controlsEditable}
            tool={tool}
            strokeStyle={strokeStyle}
            onOperations={onOperations}
            onStatusChange={setDrawingStatus}
            ariaLabel={`${teamName} drawing canvas`}
            className={`block size-full select-none ${controlsEditable ? (tool === 'object-eraser' ? 'cursor-cell' : 'cursor-crosshair') : 'cursor-default'}`}
          />

          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#181713]/85 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
            {socketStatus === 'ready'
              ? directEditPending
                ? 'Applying edit…'
                : editable
                  ? tool === 'pen'
                    ? 'Live · drag or tap'
                    : 'Live · tap a stroke'
                  : 'Live team drawing'
              : socketStatus === 'unavailable'
                ? 'Drawing unavailable'
                : 'Reconnecting drawing…'}
          </div>

          {socketError && (
            <p
              role="status"
              className="absolute inset-x-3 bottom-3 rounded-xl bg-[#ff6b4a] px-3 py-2 text-xs font-bold text-white"
            >
              {socketError}
            </p>
          )}

          <section
            aria-label="Opponent drawing activity indicator"
            className="absolute bottom-3 right-3 w-28 overflow-hidden rounded-xl border-2 border-[#181713] bg-[#ded8cc] shadow-[2px_2px_0_#181713] sm:w-36"
          >
            <p className="bg-[#181713] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-white">
              Opponent {opponentActive ? 'drawing…' : 'activity only'}
            </p>
            <div
              className={`grid aspect-video grid-cols-8 transition-opacity ${opponentActive ? 'opacity-100' : 'opacity-55'}`}
              aria-hidden="true"
            >
              {PIXEL_CELLS.map((cell) => (
                <span
                  key={`${teamId}-${cell}`}
                  className={
                    opponentActive && cell % 3 === 0
                      ? 'bg-[#5c4cf2]'
                      : 'bg-[#ded8cc]'
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

interface ToolButtonProps {
  readonly active?: boolean
  readonly disabled?: boolean
  readonly label: string
  readonly onClick: () => void
}

function ToolButton({ active, disabled, label, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="min-h-10 shrink-0 rounded-xl border-2 border-transparent bg-black/5 px-3 text-xs font-bold transition hover:bg-black/10 aria-pressed:border-[#181713] aria-pressed:bg-white disabled:cursor-not-allowed disabled:opacity-35"
    >
      {label}
    </button>
  )
}

function Separator() {
  return <div className="mx-1 h-8 w-px shrink-0 bg-black/15" />
}
