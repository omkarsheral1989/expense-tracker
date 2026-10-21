export type SyncStepStatus = 'running' | 'done' | 'error'

/** One line of the progress dialog: the backup, or (later) a group. */
export type SyncStep = {
  key: string
  label: string
  status: SyncStepStatus
  /** What the line says under its label ("Saving your data…", "Backed up", or the error). */
  detail: string
}

export type SyncState = {
  /** A sync or restore is running. */
  running: boolean
  dialogOpen: boolean
  /** The dialog's title: "Syncing" or "Restoring". */
  title: string
  steps: SyncStep[]
  /**
   * Goes up each time a sync or restore finishes, so pages that read the data
   * (the home page, the current user) read it again.
   */
  dataVersion: number
  /** Starts a run: opens the dialog with these lines. */
  start: (title: string, steps: SyncStep[]) => void
  updateStep: (key: string, change: Partial<Omit<SyncStep, 'key'>>) => void
  /** Ends a run; the dialog stays open until it is closed. */
  finish: () => void
  openDialog: () => void
  closeDialog: () => void
}
