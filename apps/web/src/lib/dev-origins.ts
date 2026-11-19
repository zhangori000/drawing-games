/**
 * Hosts allowed to use the Next dev server's own resources (the HMR socket
 * and dev chunks under `/_next/`) when the app is opened through something
 * other than `localhost`.
 *
 * Next 16 serves the page to any host but refuses those resources to every
 * other origin, and the page then never hydrates: a phone on the same Wi-Fi
 * opening `http://<laptop-ip>:3000`, or a browser on `http://127.0.0.1:3000`,
 * gets buttons that do nothing. This allows exactly this machine's own
 * addresses and names, nothing wider. It only affects `next dev`.
 */

/** The fields of `os.networkInterfaces()` entries that matter here. */
export interface InterfaceAddress {
  readonly address: string
  /** `'IPv4'`/`'IPv6'`; some Node 18 releases reported `4`/`6`. */
  readonly family: string | number
}

export type NetworkInterfaces = Readonly<
  Record<string, readonly InterfaceAddress[] | undefined>
>

export function devOrigins(
  interfaces: NetworkInterfaces,
  machineName: string,
): string[] {
  const hosts = new Set<string>(['127.0.0.1', '[::1]'])
  for (const entries of Object.values(interfaces)) {
    for (const { address, family } of entries ?? []) {
      if (family === 'IPv4' || family === 4) hosts.add(address)
      // Browsers put IPv6 hosts in brackets; zoned link-local addresses
      // (`fe80::1%en0`) never appear in a page URL.
      else if (!address.includes('%')) hosts.add(`[${address.toLowerCase()}]`)
    }
  }
  const name = machineName.trim().toLowerCase()
  if (name.length > 0) {
    hosts.add(name)
    // macOS and most Linux desktops answer `<name>.local` over mDNS.
    if (!name.endsWith('.local')) hosts.add(`${name}.local`)
  }
  return [...hosts]
}
