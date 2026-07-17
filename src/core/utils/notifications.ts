// notifications.ts — a thin, safe wrapper over the Web Notifications API.
//
// Browser-only, works while a tab is open (no service worker, no backend — true
// background push when the app is closed is a go-live concern). Every call guards
// for unsupported environments so the rest of the app can call these freely.

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

// The current permission, or 'unsupported' when the API is absent.
export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

// Ask the user to allow notifications. MUST be triggered by a user gesture (the
// Settings toggle). Resolves to the resulting permission ('denied' if unsupported).
export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.requestPermission()
}

// Show a notification if (and only if) permission is granted. No-ops otherwise,
// so callers never have to re-check.
export function showNotification(title: string, body?: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  // The constructor's side effect (displaying the notification) is the point;
  // the instance isn't needed, so it's intentionally not captured.
  void new Notification(title, body ? { body } : undefined)
}
