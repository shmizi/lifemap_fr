// Placeholder for the Goals page.
// Real content arrives in Phase 1. For now this renders a coherent, themed
// shell so navigation and dark mode can be verified end to end.

export function GoalsPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-app-text">Goals</h1>
      <p className="mt-2 text-app-text-muted">Your goals and life roadmap.</p>

      <div className="mt-6 rounded-app-lg border border-app-border bg-app-surface p-6">
        <p className="text-sm text-app-text-muted">
          This space is reserved. Phase 1 brings it to life.
        </p>
      </div>
    </section>
  )
}
