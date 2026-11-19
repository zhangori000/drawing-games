'use client'

import {
  createDrawingState,
  type DrawingState,
} from '@drawing-games/drawing-model'
import type { CanvasPreviewPayload } from '@drawing-games/protocol'
import { useCallback, useSyncExternalStore } from 'react'

import type { CanvasStore } from './canvas-store'

const EMPTY_DRAWING = createDrawingState()
const noopUnsubscribe = () => {}

/** Live drawing state for one canvas; re-renders only when it changes. */
export function useCanvasDrawing(
  store: CanvasStore,
  canvasId: string | null,
): DrawingState {
  const subscribe = useCallback(
    (listener: () => void) =>
      canvasId ? store.subscribe(canvasId, listener) : noopUnsubscribe,
    [store, canvasId],
  )
  const getSnapshot = useCallback(
    () => (canvasId ? store.getSnapshot(canvasId) : EMPTY_DRAWING),
    [store, canvasId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Latest coarse opponent preview for one canvas, or null. */
export function useCanvasPreview(
  store: CanvasStore,
  canvasId: string | null,
): CanvasPreviewPayload | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      canvasId ? store.subscribe(canvasId, listener) : noopUnsubscribe,
    [store, canvasId],
  )
  const getSnapshot = useCallback(
    () => (canvasId ? store.getPreview(canvasId) : null),
    [store, canvasId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
