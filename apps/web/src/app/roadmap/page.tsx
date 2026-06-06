import type { Metadata } from 'next'
import { Fraunces, DM_Sans } from 'next/font/google'
import { RoadmapContent } from './RoadmapContent'

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'Product Roadmap 2026–2027 — BizTrack CM',
  description:
    'See what\'s already live and what\'s coming next on BizTrack CM — the POS and accounting platform built for Cameroonian businesses.',
}

export default function RoadmapPage() {
  return (
    <div className={`${fraunces.variable} ${dmSans.variable}`}>
      <RoadmapContent />
    </div>
  )
}
