/**
 * Where the realtime Worker lives. Client-only: without
 * `NEXT_PUBLIC_REALTIME_URL` the base is derived from the page's own host so
 * a phone on the same Wi-Fi (`http://<laptop-ip>:3000`) reaches
 * `http://<laptop-ip>:8787` without any configuration.
 */
const DEFAULT_REALTIME_PORT = 8787

export function realtimeBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  if (typeof window === 'undefined') {
    throw new Error('The realtime URL can only be derived in the browser')
  }
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:${DEFAULT_REALTIME_PORT}`
}

export function realtimeHttpUrl(path: string): string {
  return `${realtimeBaseUrl()}${normalizePath(path)}`
}

export function realtimeWsUrl(path: string): string {
  const base = realtimeBaseUrl().replace(/^http(s?):/i, (_match, secure) =>
    secure ? 'wss:' : 'ws:',
  )
  return `${base}${normalizePath(path)}`
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}
