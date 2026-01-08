/**
 * Shared store for Circle to Summarize feature state
 * This allows the main window keyboard handler to toggle the pen tool
 * even when the toolbar overlay doesn't have focus.
 */
import { writable } from 'svelte/store'

// Store for pen tool active state - can be subscribed to from any component
export const penToolActiveStore = writable(false)

// Function to toggle pen tool - can be called from keyboard shortcuts
export function togglePenTool() {
  console.log('[CircleToSummarize Store] Toggling pen tool')
  penToolActiveStore.update((active) => !active)
}

// Function to set pen tool state explicitly
export function setPenToolActive(active: boolean) {
  console.log('[CircleToSummarize Store] Setting pen tool active:', active)
  penToolActiveStore.set(active)
}
