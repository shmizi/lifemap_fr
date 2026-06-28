// DailyQuotePanel — the glass "Field Note": one motivational quote per day,
// rotated deterministically from the bundled set (no repeats until all are seen).
// Pure: it reads the date once and asks the pure selector; no network, no state.

import { format } from 'date-fns'
import { dailyQuote } from '@/core/utils/dailyQuote'
import { GlassPanel } from './GlassPanel'

interface DailyQuotePanelProps {
  initial: { top?: number; left?: number; right?: number; bottom?: number }
  width?: number
}

export function DailyQuotePanel({ initial, width }: DailyQuotePanelProps) {
  const now = new Date()
  const [text, author] = dailyQuote(now)
  return (
    <GlassPanel title="Field Note" accent="var(--accent-discovery)" initial={initial} width={width}>
      <p className="font-display text-[15px] italic leading-snug text-app-text">“{text}”</p>
      <p className="mt-2 text-[11.5px] font-semibold text-app-text-muted">— {author}</p>
      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-widest text-app-text-muted">
        {format(now, 'EEEE · d MMM')}
      </p>
    </GlassPanel>
  )
}
