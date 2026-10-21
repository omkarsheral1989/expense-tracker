import { create } from 'zustand'
import type { SyncState } from './types.ts'

/**
 * The sync or restore that is running and what its progress dialog shows
 * (ADR-044). Kept outside the components so closing the dialog, or leaving the
 * page, does not stop it. In memory only.
 */
export const useSyncStore = create<SyncState>()((set) => ({
  running: false,
  dialogOpen: false,
  title: '',
  steps: [],
  dataVersion: 0,
  start: (title, steps) => set({ running: true, dialogOpen: true, title, steps }),
  updateStep: (key, change) =>
    set((state) => ({
      steps: state.steps.map((step) => (step.key === key ? { ...step, ...change } : step)),
    })),
  addStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  finish: () => set((state) => ({ running: false, dataVersion: state.dataVersion + 1 })),
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}))
