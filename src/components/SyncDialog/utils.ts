import type { SyncStep } from '../../stores/useSyncStore/types.ts'

/** The order of the dialog's lines, and which lines have already been moved up for running. */
export type LineOrder = { keys: string[]; promoted: string[] }

export const EMPTY_ORDER: LineOrder = { keys: [], promoted: [] }

/**
 * The order of the lines for the steps of a run. The first step (the backup) stays on top; a step that starts running moves up
 * to just below it, once, and then stays wherever it is when it finishes, so what is happening now is always at the top and the
 * order the run ended in is kept. A new run (fewer steps than before) starts from the steps' own order.
 */
export function nextOrder(previous: LineOrder, steps: readonly SyncStep[]): LineOrder {
  const known = steps.length < previous.keys.length ? EMPTY_ORDER : previous
  const present = steps.map((step) => step.key)
  let keys = known.keys.filter((key) => present.includes(key))
  keys = [...keys, ...present.filter((key) => !keys.includes(key))]
  const promoted = known.promoted.filter((key) => present.includes(key))
  for (const step of steps.slice(1)) {
    if (step.status !== 'running' || promoted.includes(step.key)) continue
    keys = [keys[0], step.key, ...keys.slice(1).filter((key) => key !== step.key)]
    promoted.push(step.key)
  }
  return { keys, promoted }
}

/** Whether two orders are the same, so a change is only stored when there is one. */
export function sameOrder(a: LineOrder, b: LineOrder): boolean {
  return a.keys.join('|') === b.keys.join('|') && a.promoted.join('|') === b.promoted.join('|')
}
