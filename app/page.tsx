'use client'

import dynamic from 'next/dynamic'

const ItemsMap = dynamic(() => import('@/components/ItemsMap'), {
  ssr: false,
})

export default function Home() {
  return <ItemsMap />
}