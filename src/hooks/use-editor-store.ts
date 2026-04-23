/**
 * React hook to bind the travels-based editor store to React's
 * rendering lifecycle via useSyncExternalStore.
 */

import { useSyncExternalStore, useCallback, useMemo } from "react";
import { getEditorStore } from "@/store/editor-store";
import type { EditorState } from "@/types";

/**
 * Subscribe to the full editor state. Re-renders on every state change.
 * For performance-critical components, use useEditorSelector instead.
 */
export function useEditorStore() {
  const store = getEditorStore();

  const subscribe = useMemo(() => store.subscribe.bind(store), [store]);
  const getSnapshot = useMemo(() => store.getState.bind(store), [store]);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  const setState = useMemo(() => store.setState.bind(store), [store]);
  const controls = store.getControls();

  return { state, setState, controls };
}

/**
 * Subscribe to a derived slice of editor state to minimize re-renders.
 *
 * @example
 * const tileSize = useEditorSelector(s => s.tileSize)
 */
export function useEditorSelector<T>(selector: (state: EditorState) => T): T {
  const store = getEditorStore();

  const subscribe = useMemo(() => store.subscribe.bind(store), [store]);

  const getSnapshot = useCallback(
    () => selector(store.getState()),
    [selector, store],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
