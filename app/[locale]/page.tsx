'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const SaunaMap = dynamic(() => import('@/components/SaunaMap'), {
  ssr: false,
})

export default function Home() {
  // Suspense boundary required because SaunaMap reads useSearchParams
  // (SP-039I `/?sauna=<uuid>` deep link).
  return (
    <Suspense fallback={null}>
      <SaunaMap />
    </Suspense>
  )
}
