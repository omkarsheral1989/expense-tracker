import { create } from 'zustand'
import { dataChanges } from '../../db/changes.ts'
import type { SyncState } from './types.ts'

/**
 * The sync that is running and what its progress dialog shows
 * (ADR-044). Kept outside the components so closing the dialog, or leaving the
 * page, does not stop it. In memory only.
 */
export const useSyncStore = create<SyncState>()((set) => ({
  running: false,
  dialogOpen: false,
  title: '',
  steps: [],
  scope: { kind: 'all' },
  resume: null,
  dataVersion: 0,
  start: (title, steps, scope) => set({ running: true, dialogOpen: true, title, steps, scope, resume: null }),
  setResume: (resume) => set({ resume }),
  updateStep: (key, change) =>
    set((state) => ({
      steps: state.steps.map((step) => (step.key === key ? { ...step, ...change } : step)),
    })),
  addStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  finish: () => {
    set((state) => ({ running: false, dataVersion: state.dataVersion + 1 }))
    // A sync may have brought in groups and expenses: pages that remember data must read it again.
    dataChanges.announce()
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}))
