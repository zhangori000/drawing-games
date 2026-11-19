import type { Metadata } from 'next'

import { MeClient } from './me-client'

export const metadata: Metadata = {
  title: 'Your stats',
  description: 'Your Dual Draw profile, lifetime stats, and word history.',
}

export default function MePage() {
  return <MeClient />
}
