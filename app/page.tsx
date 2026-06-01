'use client'

import dynamic from 'next/dynamic'

const SaunaMap = dynamic(() => import('@/components/SaunaMap'), {
  ssr: false,
})

export default function Home() {
  return <SaunaMap />
}