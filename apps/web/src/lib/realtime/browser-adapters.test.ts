import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBrowserSocket } from './browser-adapters'

/** The parts of a browser WebSocket the adapter touches. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 0
  bufferedAmount = 0
  closeCalls: Array<{ code?: number; reason?: string }> = []
  sent: string[] = []
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    // A real browser logs "closed before the connection is established".
    if (this.readyState === 0) throw new Error('closed while connecting')
    this.closeCalls.push({ code, reason })
    this.readyState = 2
  }

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  message(data: string): void {
    this.onmessage?.({ data })
  }

  closed(code: number): void {
    this.readyState = 3
    this.onclose?.({ code, reason: '' })
  }
}

describe('createBrowserSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const latest = () => FakeWebSocket.instances.at(-1)!

  it('forwards events and closes an open socket at once', () => {
    const socket = createBrowserSocket('ws://room')
    const opened = vi.fn()
    const messages: unknown[] = []
    const closes: number[] = []
    socket.onopen = opened
    socket.onmessage = (event) => messages.push(event.data)
    socket.onclose = (event) => closes.push(event.code)

    latest().open()
    latest().message('hello')
    socket.send('ping')
    socket.close(1000)
    latest().closed(1000)

    expect(opened).toHaveBeenCalledOnce()
    expect(messages).toEqual(['hello'])
    expect(latest().sent).toEqual(['ping'])
    expect(latest().closeCalls).toEqual([{ code: 1000, reason: undefined }])
    expect(closes).toEqual([1000])
  })

  it('holds a close asked for while connecting until the socket opens', () => {
    const socket = createBrowserSocket('ws://room')
    const opened = vi.fn()
    const messages: unknown[] = []
    socket.onopen = opened
    socket.onmessage = (event) => messages.push(event.data)

    // React StrictMode's dev remount: closed before it ever connected.
    expect(() => socket.close(1000)).not.toThrow()
    expect(latest().closeCalls).toEqual([])
    expect(socket.readyState).toBe(2)

    latest().open()
    latest().message('too late')

    expect(latest().closeCalls).toEqual([{ code: 1000, reason: undefined }])
    expect(opened).not.toHaveBeenCalled()
    expect(messages).toEqual([])
    expect(socket.readyState).toBe(2)
  })

  it('closes only once when asked again while connecting', () => {
    const socket = createBrowserSocket('ws://room')
    socket.close(1000)
    socket.close(4000)
    latest().open()
    expect(latest().closeCalls).toEqual([{ code: 1000, reason: undefined }])
  })

  it('lets a connection that fails end with its own close event', () => {
    const socket = createBrowserSocket('ws://room')
    const closes: number[] = []
    socket.onclose = (event) => closes.push(event.code)
    socket.close(1000)
    latest().closed(1006)
    expect(latest().closeCalls).toEqual([])
    expect(closes).toEqual([1006])
    expect(socket.readyState).toBe(3)
  })
})
