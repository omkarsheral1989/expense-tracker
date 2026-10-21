/** 'waiting': a group whose creator has not synced it yet (a clock instead of a tick). */
export type SyncStepStatus = 'running' | 'done' | 'error' | 'waiting'

/** One line of the progress dialog: the backup, or a group. */
export type SyncStep = {
  key: string
  label: string
  status: SyncStepStatus
  /** What the line says under its label ("Saving your data…", "Backed up", or the error). */
  detail: string
}

/** What a run synced, so the dialog can say when it last finished: everything, one group, or nothing (a restore). */
export type SyncScope = { kind: 'all' } | { kind: 'group'; groupId: string } | { kind: 'restore' }

export type SyncState = {
  /** A sync or restore is running. */
  running: boolean
  dialogOpen: boolean
  /** The dialog's title: "Syncing" or "Restoring". */
  title: string
  steps: SyncStep[]
  scope: SyncScope
  /**
   * Runs the stopped run again: set when Drive access ran out, so the dialog
   * offers Continue (which must be pressed, since Google asks again from a
   * click). Null otherwise.
   */
  resume: (() => void) | null
  /**
   * Goes up each time a sync or restore finishes, so pages that read the data
   * (the home page, the current user) read it again.
   */
  dataVersion: number
  /** Starts a run: opens the dialog with these lines. */
  start: (title: string, steps: SyncStep[], scope: SyncScope) => void
  setResume: (resume: (() => void) | null) => void
  updateStep: (key: string, change: Partial<Omit<SyncStep, 'key'>>) => void
  /** Adds a line at the end, as a run reaches the next group. */
  addStep: (step: SyncStep) => void
  /** Ends a run; the dialog stays open until it is closed. */
  finish: () => void
  openDialog: () => void
  closeDialog: () => void
}
