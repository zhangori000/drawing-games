import * as identity from '../identity'
import { realtimeWsUrl } from './config'
import type {
  SeatStore,
  TimerApi,
  WakeInfo,
  WebSocketLike,
} from './connection-types'

/** Browser defaults for `RoomConnection`; tests inject fakes instead. */
export const browserTimers: TimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export const browserSeats: SeatStore = {
  loadTabSeat: identity.loadTabSeat,
  loadLatestSeat: identity.loadLatestSeat,
  saveSeat: (roomCode, seat) => {
    identity.saveSeat(roomCode, seat)
  },
  claimSeatForTab: identity.claimSeatForTab,
  updateSeatDisplayName: identity.updateSeatDisplayName,
  forgetSeat: identity.forgetSeat,
}

export function browserLifecycle(wake: (info?: WakeInfo) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  let hiddenAt: number | null =
    document.visibilityState === 'hidden' ? Date.now() : null
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const hiddenForMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    wake({ hiddenForMs })
  }
  const onWake = () => wake()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', onWake)
  window.addEventListener('online', onWake)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onWake)
    window.removeEventListener('online', onWake)
  }
}

export function defaultSocketUrl(roomCode: string, sessionId: string): string {
  return realtimeWsUrl(
    `/rooms/${encodeURIComponent(roomCode)}/socket?sessionId=${encodeURIComponent(sessionId)}`,
  )
}

/** Adapts a real WebSocket to the narrow, test-friendly interface. */
export function createBrowserSocket(url: string): WebSocketLike {
  const socket = new WebSocket(url)
  const adapter: WebSocketLike = {
    get readyState() {
      return socket.readyState
    },
    get bufferedAmount() {
      return socket.bufferedAmount
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
  }
  socket.onopen = (event) => adapter.onopen?.(event)
  socket.onmessage = (event) => adapter.onmessage?.({ data: event.data })
  socket.onclose = (event) =>
    adapter.onclose?.({ code: event.code, reason: event.reason })
  socket.onerror = (event) => adapter.onerror?.(event)
  return adapter
}
