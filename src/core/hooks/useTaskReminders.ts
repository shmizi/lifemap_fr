// useTaskReminders — fires calm, in-app task reminders while the app is open.
//
// Mounted once in AppLayout. When reminders are enabled AND the OS permission is
// granted, it checks a few times per day (morning / afternoon / evening slots) and
// shows ONE summary notification per slot per day: how many tasks are due today
// and how many are overdue. It reads the store's already-computed windows via
// getState() on each tick, so it never re-subscribes or holds a stale closure.
//
// Deliberately open-tab only (no service worker / backend). Slot firing is deduped
// per day in localStorage so a long-open tab never nags more than once per slot.

import { useEffect } from 'react'
import { format } from 'date-fns'
import { REMINDER_SLOTS } from '@/core/constants'
import { useUIStore } from '@/store/useUIStore'
import { useGoalStore } from '@/store/useGoalStore'
import {
  notificationsSupported,
  showNotification,
} from '@/core/utils/notifications'

// How often to re-check the clock (5 min) — cheap, and fine granularity for slots.
const CHECK_INTERVAL_MS = 5 * 60 * 1000

export function useTaskReminders(): void {
  const remindersEnabled = useUIStore((s) => s.remindersEnabled)

  useEffect(() => {
    if (!remindersEnabled) return
    if (!notificationsSupported() || Notification.permission !== 'granted') return

    const check = (): void => {
      const now = new Date()
      const hour = now.getHours()
      const dayKey = format(now, 'yyyy-MM-dd')

      // Earliest slot that has passed today and hasn't fired yet.
      for (const slot of REMINDER_SLOTS) {
        if (hour < slot) continue
        const key = `lifemap-reminder-${slot}-${dayKey}`
        if (localStorage.getItem(key)) continue

        const { todaysTasks, overdueTasks } = useGoalStore.getState()
        const pending = todaysTasks.filter((t) => t.status !== 'completed').length
        const overdue = overdueTasks.length
        // Nothing to nudge about — leave the slot unmarked so it can still fire
        // later today if tasks appear.
        if (pending + overdue === 0) continue

        localStorage.setItem(key, '1')
        const parts: string[] = []
        if (pending > 0) parts.push(`${pending} task${pending === 1 ? '' : 's'} due today`)
        if (overdue > 0) parts.push(`${overdue} overdue`)
        showNotification('LifeMap', `You have ${parts.join(' and ')}.`)
        break // one nudge per check
      }
    }

    check() // catch a slot that already passed when the app opened
    const id = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [remindersEnabled])
}
