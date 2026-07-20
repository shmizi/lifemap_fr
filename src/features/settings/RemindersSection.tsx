// RemindersSection — the Settings control for in-app task reminders. Turning it
// on requests the OS notification permission (a user gesture); the enabled flag is
// a device preference in useUIStore. The actual nudges are fired by
// useTaskReminders (mounted in AppLayout) while the app is open.

import { useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/core/utils/notifications'

const segmentBase =
  'flex flex-1 items-center justify-center gap-2 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30 disabled:cursor-not-allowed disabled:opacity-40'

export function RemindersSection() {
  const remindersEnabled = useUIStore((s) => s.remindersEnabled)
  const setRemindersEnabled = useUIStore((s) => s.setRemindersEnabled)

  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => notificationPermission())
  const [busy, setBusy] = useState(false)

  const supported = permission !== 'unsupported'
  // "On" only when the user chose it AND the OS still allows it.
  const on = remindersEnabled && permission === 'granted'

  async function selectOn() {
    if (busy) return
    setBusy(true)
    try {
      let perm = permission
      if (perm === 'default') {
        perm = await requestNotificationPermission()
        setPermission(perm)
      }
      if (perm === 'granted') setRemindersEnabled(true)
    } finally {
      setBusy(false)
    }
  }

  function selectOff() {
    setRemindersEnabled(false)
  }

  return (
    <section className="border border-app-border bg-app-surface p-6">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-text">
        Reminders
      </h2>
      <div className="mt-2 border-t border-app-border" />
      <p className="pt-3 text-sm text-app-text-muted">
        Gentle nudges about today&apos;s and overdue tasks — morning, afternoon,
        and evening, while LifeMap is open on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Task reminders"
        className="mt-5 flex gap-1 border border-app-border bg-app-surface-alt p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={on}
          onClick={selectOn}
          disabled={!supported || busy}
          className={`${segmentBase} ${
            on
              ? 'bg-app-text text-app-surface'
              : 'text-app-text-muted hover:text-app-text'
          }`}
        >
          <Bell size={16} />
          On
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!on}
          onClick={selectOff}
          className={`${segmentBase} ${
            !on
              ? 'bg-app-text text-app-surface'
              : 'text-app-text-muted hover:text-app-text'
          }`}
        >
          <BellOff size={16} />
          Off
        </button>
      </div>

      {!supported ? (
        <p className="mt-3 text-xs text-app-text-muted">
          This browser doesn&apos;t support notifications.
        </p>
      ) : permission === 'denied' ? (
        <p className="mt-3 text-xs text-amber-600">
          Notifications are blocked. Allow them in your browser&apos;s site
          settings, then turn this on.
        </p>
      ) : on ? (
        <p className="mt-3 text-xs text-app-text-muted">
          You&apos;ll be nudged while LifeMap is open in a tab.
        </p>
      ) : null}
    </section>
  )
}
