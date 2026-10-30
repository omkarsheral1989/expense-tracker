import type { SyncStep } from '../../stores/useSyncStore/types.ts'

/** The order of the dialog's lines, and which lines have already been seen running (so they fade in once). */
export type LineOrder = { keys: string[]; promoted: string[] }

export const EMPTY_ORDER: LineOrder = { keys: [], promoted: [] }

/**
 * The order of the lines for the steps of a run. The first step (the backup) stays on top, then the steps that are running, then
 * the others in their own order. While nothing but the backup is running the order stays as it was, so what a run ended with is
 * kept. The dialog starts a new run from `EMPTY_ORDER`.
 */
export function nextOrder(previous: LineOrder, steps: readonly SyncStep[]): LineOrder {
  const known = previous
  const present = steps.map((step) => step.key)
  const promoted = known.promoted.filter((key) => present.includes(key))
  const running = steps.slice(1).filter((step) => step.status === 'running').map((step) => step.key)
  for (const key of running) if (!promoted.includes(key)) promoted.push(key)

  if (running.length === 0) {
    // Keep the order, adding lines that are new at the end.
    const kept = known.keys.filter((key) => present.includes(key))
    return { keys: [...kept, ...present.filter((key) => !kept.includes(key))], promoted }
  }
  const [first] = present
  const rest = present.filter((key) => key !== first && !running.includes(key))
  return { keys: [first, ...running, ...rest], promoted }
}

/** Whether two orders are the same, so a change is only stored when there is one. */
export function sameOrder(a: LineOrder, b: LineOrder): boolean {
  return a.keys.join('|') === b.keys.join('|') && a.promoted.join('|') === b.promoted.join('|')
}
