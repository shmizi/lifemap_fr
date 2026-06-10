// Placeholder for the Dashboard page.
// Real content arrives in Phase 2. For now this renders a coherent, themed
// shell so navigation and dark mode can be verified end to end.

export function DashboardPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Dashboard</h1>
      <p className="mt-2 text-app-text-muted">Today's dashboard — what matters right now.</p>

      <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-6">
        <p className="text-sm text-app-text-muted">
          This space is reserved. Phase 2 brings it to life.
        </p>
      </div>
    </section>
  )
}
