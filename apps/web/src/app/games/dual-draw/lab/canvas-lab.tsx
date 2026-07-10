'use client'

import {
  createDrawingState,
  drawingReducer,
  findTopStrokeAtPoint,
  type DrawingState,
  type NormalizedPoint,
  type Stroke,
  type StrokeStyle,
} from '@drawing-games/drawing-model'
import { getGuessScoreBreakdown } from '@drawing-games/game-core'
import Link from 'next/link'
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

const COLORS = ['#181713', '#5c4cf2', '#ff6b4a', '#1f9d72', '#f0b429']
const WIDTHS = [0.006, 0.012, 0.022] as const
const SCORE_PREVIEW = getGuessScoreBreakdown({
  secondsRemaining: 54,
  roundSeconds: 90,
  difficulty: 'hard',
})

type Tool = 'pen' | 'object-eraser'

interface ActivePointer {
  readonly pointerId: number
  readonly strokeId: string
  nextPointIndex: number
}

export function CanvasLab() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<DrawingState>(createDrawingState())
  const activePointerRef = useRef<ActivePointer | null>(null)
  const guessInputRef = useRef<HTMLInputElement>(null)
  const [drawing, dispatch] = useReducer(drawingReducer, undefined, () =>
    createDrawingState(),
  )
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[1] ?? '#5c4cf2')
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(WIDTHS[1])
  const [guess, setGuess] = useState('')
  const [lastGuess, setLastGuess] = useState<string | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    const viewport = window.visualViewport
    if (!root) return

    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight
      const offsetTop = viewport?.offsetTop ?? 0
      root.style.height = `${Math.round(height)}px`
      root.style.transform = `translateY(${Math.round(offsetTop)}px)`
      setKeyboardOpen(height < window.innerHeight * 0.72)
    }

    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)

    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => renderDrawing(canvas, drawingRef.current)
    const observer = new ResizeObserver(() => {
      sizeCanvas(canvas)
      render()
    })

    observer.observe(canvas)
    sizeCanvas(canvas)
    render()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    drawingRef.current = drawing
    const canvas = canvasRef.current
    if (canvas) renderDrawing(canvas, drawing)
  }, [drawing])

  const strokeStyle: StrokeStyle = {
    color,
    width,
    opacity: 1,
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || activePointerRef.current) return

    const point = eventPoint(event, event.currentTarget)

    if (tool === 'object-eraser') {
      const stroke = findTopStrokeAtPoint(drawingRef.current, point, 0.03)
      if (stroke) dispatch({ type: 'stroke.delete', strokeId: stroke.id })
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const strokeId = crypto.randomUUID()
    activePointerRef.current = {
      pointerId: event.pointerId,
      strokeId,
      nextPointIndex: 1,
    }
    dispatch({
      type: 'stroke.begin',
      strokeId,
      point,
      style: strokeStyle,
    })
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activePointerRef.current
    if (!active || active.pointerId !== event.pointerId) return

    const points = coalescedPoints(event, event.currentTarget)
    if (points.length === 0) return

    dispatch({
      type: 'stroke.append',
      strokeId: active.strokeId,
      startPointIndex: active.nextPointIndex,
      points,
    })
    active.nextPointIndex += points.length
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activePointerRef.current
    if (!active || active.pointerId !== event.pointerId) return

    dispatch({
      type: 'stroke.end',
      strokeId: active.strokeId,
      pointCount: active.nextPointIndex,
    })
    activePointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activePointerRef.current
    if (!active || active.pointerId !== event.pointerId) return

    dispatch({ type: 'stroke.delete', strokeId: active.strokeId })
    activePointerRef.current = null
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = guess.trim()
    if (!normalized) return

    setLastGuess(normalized)
    setGuess('')
    requestAnimationFrame(() =>
      guessInputRef.current?.focus({ preventScroll: true }),
    )
  }

  const canUndo =
    drawing.inProgressOrder.length === 0 && drawing.history.past.length > 0
  const canRedo =
    drawing.inProgressOrder.length === 0 && drawing.history.future.length > 0
  const hasDrawing =
    drawing.document.strokeOrder.length > 0 ||
    drawing.inProgressOrder.length > 0

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[#f5f0e8] text-[#181713]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[#181713] bg-[#f8ff80] px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#181713] bg-white text-lg font-black transition hover:-translate-y-0.5"
            aria-label="Back to home"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-black sm:text-base">
              Dual Draw · local canvas lab
            </p>
            {!keyboardOpen && (
              <p className="truncate text-xs text-black/55">
                Vector ink now; authoritative rooms next
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-black/15 bg-white/55 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider sm:inline-flex">
            Round 1/6
          </span>
          <span className="grid min-w-14 place-items-center rounded-full border-2 border-[#181713] bg-[#ff6b4a] px-3 py-1.5 font-mono text-sm font-black text-white">
            :54
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b-2 border-black/10 bg-white/70 px-3 py-2 sm:px-5">
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
          <div className="mx-1 h-8 w-px shrink-0 bg-black/15" />

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

          <div className="mx-1 h-8 w-px shrink-0 bg-black/15" />
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

          <div className="mx-1 h-8 w-px shrink-0 bg-black/15" />
          <ToolButton
            disabled={!canUndo}
            label="Undo"
            onClick={() => dispatch({ type: 'drawing.undo' })}
          />
          <ToolButton
            disabled={!canRedo}
            label="Redo"
            onClick={() => dispatch({ type: 'drawing.redo' })}
          />
          <ToolButton
            disabled={!hasDrawing}
            label="Clear"
            onClick={() => {
              if (window.confirm('Clear the canvas? You can still undo it.')) {
                dispatch({ type: 'drawing.clear' })
              }
            }}
          />
        </div>

        <section
          className="relative min-h-0 bg-[#ded8cc] p-2 sm:p-4"
          aria-label="Drawing area"
        >
          <div className="relative h-full min-h-32 overflow-hidden rounded-2xl border-2 border-[#181713] bg-white shadow-[4px_4px_0_#181713]">
            <canvas
              ref={canvasRef}
              className={`block size-full select-none ${tool === 'object-eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
              style={{ touchAction: 'none' }}
              aria-label="Local drawing canvas. Use the toolbar to choose a pen or erase complete strokes."
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerCancel}
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#181713]/80 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
              {tool === 'pen'
                ? 'Local ink · zero wait'
                : 'Tap a stroke to erase it'}
            </div>
          </div>
        </section>

        <form
          onSubmit={submitGuess}
          className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-t-2 border-[#181713] bg-[#f5f0e8] p-3 sm:p-4 lg:col-start-1"
        >
          <label className="sr-only" htmlFor="guess-input">
            Your guess
          </label>
          <input
            ref={guessInputRef}
            id="guess-input"
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Type a guess—the canvas stays put"
            className="min-h-12 min-w-0 rounded-xl border-2 border-[#181713] bg-white px-4 text-base outline-none placeholder:text-black/35 focus:ring-4 focus:ring-[#5c4cf2]/25"
          />
          <button
            type="submit"
            className="min-h-12 rounded-xl border-2 border-[#181713] bg-[#5c4cf2] px-5 font-black text-white shadow-[2px_2px_0_#181713] transition hover:-translate-y-0.5"
          >
            Guess
          </button>
          <p
            aria-live="polite"
            className={
              keyboardOpen
                ? 'sr-only'
                : 'col-span-2 h-5 truncate px-1 text-xs text-black/55'
            }
          >
            {lastGuess
              ? `“${lastGuess}” sent locally. Focus stayed here.`
              : '\u00a0'}
          </p>
        </form>

        <aside className="hidden min-h-0 overflow-y-auto border-l-2 border-[#181713] bg-[#fffdf7] p-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex lg:flex-col lg:gap-5">
          <section>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
              Hard word score preview
            </p>
            <div className="mt-3 rounded-2xl border-2 border-[#181713] bg-[#f8ff80] p-4">
              <p className="text-4xl font-black tracking-[-0.06em]">
                {SCORE_PREVIEW.total}
                <span className="ml-1 text-base">pts</span>
              </p>
              <dl className="mt-4 grid gap-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <dt>Speed</dt>
                  <dd>{SCORE_PREVIEW.speedScore}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Hard bonus</dt>
                  <dd>+{SCORE_PREVIEW.difficultyBonus}</dd>
                </div>
                <div className="flex justify-between border-t border-black/20 pt-1.5 font-bold">
                  <dt>Total</dt>
                  <dd>{SCORE_PREVIEW.total}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
              Opponent preview contract
            </p>
            <div className="mt-3 grid aspect-video grid-cols-8 overflow-hidden rounded-2xl border-2 border-[#181713] bg-[#ded8cc] blur-[1.5px]">
              {Array.from({ length: 48 }, (_, index) => (
                <span
                  key={index}
                  className={
                    index % 7 === 0
                      ? 'bg-[#5c4cf2]'
                      : index % 5 === 0
                        ? 'bg-[#ff6b4a]'
                        : index % 3 === 0
                          ? 'bg-white'
                          : 'bg-[#ded8cc]'
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-black/50">
              The real room will send only an irreversible coarse image—not raw
              opponent strokes hidden with CSS.
            </p>
          </section>

          <div className="mt-auto rounded-2xl bg-[#181713] p-4 text-sm leading-6 text-white/70">
            This lab is intentionally local. It proves the drawing model and
            keyboard layout before networking can disguise UI bugs.
          </div>
        </aside>
      </div>
    </div>
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

function sizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * ratio))
  const height = Math.max(1, Math.round(rect.height * ratio))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

function renderDrawing(canvas: HTMLCanvasElement, state: DrawingState) {
  const context = canvas.getContext('2d')
  if (!context) return

  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  for (const strokeId of state.document.strokeOrder) {
    const stroke = state.document.strokesById[strokeId]
    if (stroke) renderStroke(context, stroke, width, height)
  }

  for (const strokeId of state.inProgressOrder) {
    const stroke = state.inProgressById[strokeId]
    if (stroke) renderStroke(context, stroke, width, height)
  }
}

function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
) {
  const firstPoint = stroke.points[0]
  if (!firstPoint) return

  context.save()
  context.globalAlpha = stroke.style.opacity
  context.strokeStyle = stroke.style.color
  context.fillStyle = stroke.style.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, stroke.style.width * Math.min(width, height))

  if (stroke.points.length === 1) {
    context.beginPath()
    context.arc(
      firstPoint.x * width,
      firstPoint.y * height,
      context.lineWidth / 2,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.restore()
    return
  }

  context.beginPath()
  context.moveTo(firstPoint.x * width, firstPoint.y * height)
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x * width, point.y * height)
  }
  context.stroke()
  context.restore()
}

function eventPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure'>,
  canvas: HTMLCanvasElement,
): NormalizedPoint {
  const rect = canvas.getBoundingClientRect()
  const x = clampUnit((event.clientX - rect.left) / Math.max(1, rect.width))
  const y = clampUnit((event.clientY - rect.top) / Math.max(1, rect.height))
  const pressure = event.pressure > 0 ? clampUnit(event.pressure) : undefined

  return pressure === undefined ? { x, y } : { x, y, pressure }
}

function coalescedPoints(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): NormalizedPoint[] {
  const nativeEvent = event.nativeEvent
  const samples = nativeEvent.getCoalescedEvents?.() ?? [nativeEvent]
  return samples.map((sample) => eventPoint(sample, canvas))
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}
