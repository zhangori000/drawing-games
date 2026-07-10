import type { Metadata } from 'next'

import { CanvasLab } from './canvas-lab'

export const metadata: Metadata = {
  title: 'Dual Draw canvas lab',
  description:
    'A local playground for testing vector ink, object erase, undo, redo, and a keyboard-stable guess composer.',
}

export default function DualDrawCanvasLabPage() {
  return <CanvasLab />
}
