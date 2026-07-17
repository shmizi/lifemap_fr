// googleCalendar.ts — build a Google Calendar "create event" link.
//
// PURE: no side effects. Returns a Google Calendar TEMPLATE URL that, when opened,
// pre-fills a new event. No API, no OAuth, no key — it's just a link, so it works
// for any signed-in Google user and adds zero backend surface. This is the app's
// lightweight calendar integration (a listed example feature in the brief) and a
// Google technology used.
//
// We schedule a timed block: by default 09:00 local for `durationMinutes` (the
// task's estimatedMinutes). The `dates` value carries no timezone marker, so
// Google interprets it in the viewer's own calendar timezone — correct for a
// "do this on this day" task without us doing timezone math.

interface CalendarEventInput {
  title: string
  // The calendar day, date-only 'YYYY-MM-DD' (a task's scheduledDate/dueDate).
  date: string
  // Optional longer text shown in the event body.
  details?: string
  // Block length in minutes (defaults to 30 when unknown).
  durationMinutes?: number
  // Start of day, minutes from midnight (defaults to 09:00 = 540).
  startMinuteOfDay?: number
}

const DEFAULT_START_MINUTE = 9 * 60 // 09:00
const DEFAULT_DURATION = 30
const DAY_END = 24 * 60 - 1 // clamp so an event never spills past the day

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// minutes-from-midnight -> 'HHMMSS'
function hhmmss(minuteOfDay: number): string {
  const m = Math.max(0, Math.min(minuteOfDay, DAY_END))
  return `${pad2(Math.floor(m / 60))}${pad2(m % 60)}00`
}

export function googleCalendarUrl(input: CalendarEventInput): string {
  const { title, date, details, durationMinutes, startMinuteOfDay } = input
  const ymd = date.replace(/-/g, '')
  const start = startMinuteOfDay ?? DEFAULT_START_MINUTE
  const end = start + (durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_DURATION)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${ymd}T${hhmmss(start)}/${ymd}T${hhmmss(end)}`,
  })
  if (details && details.trim().length > 0) {
    params.set('details', details.trim())
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
