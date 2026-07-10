import type { Metadata } from 'next'

import { WordLibraryClient } from './word-library-client'

export const metadata: Metadata = {
  title: 'Word library · Drawing Games',
  description: 'Curate the local Master word list and custom game collections.',
}

export default function WordLibraryPage() {
  return <WordLibraryClient />
}
