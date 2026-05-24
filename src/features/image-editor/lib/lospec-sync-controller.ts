import {
  loadLospecPaletteCache,
  loadLospecPaletteSyncCheckpoint,
  saveLospecPaletteSyncCheckpoint,
} from "@/services/db";
import { syncLospecPaletteCatalog } from "@/features/image-editor/lib/lospec-palettes";
import type {
  LospecPaletteRecord,
  LospecPaletteSyncCheckpoint,
  LospecPaletteSyncDependencies,
  LospecPaletteSyncResult,
  LospecPaletteSyncSnapshot,
} from "@/features/image-editor/types";

const LOSPEC_RATE_LIMIT_RETRY_MS = 60_000;

const INITIAL_SNAPSHOT: LospecPaletteSyncSnapshot = {
  palettes: [],
  hasLoaded: false,
  status: "idle",
  nextPage: 0,
  retryAtMs: null,
  fetchedPageCount: 0,
  addedCount: 0,
  updatedAt: 0,
};

interface LospecPaletteSyncControllerDependencies {
  loadCache: () => Promise<LospecPaletteRecord[]>;
  loadCheckpoint: () => LospecPaletteSyncCheckpoint | null;
  saveCheckpoint: (checkpoint: LospecPaletteSyncCheckpoint) => void;
  now: () => number;
  setTimeoutImpl: typeof setTimeout;
  clearTimeoutImpl: typeof clearTimeout;
  syncCatalog: (
    dependencies: LospecPaletteSyncDependencies,
  ) => Promise<LospecPaletteSyncResult>;
}

export interface LospecPaletteSyncController {
  dispose: () => void;
  getSnapshot: () => LospecPaletteSyncSnapshot;
  start: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
}

function toCheckpoint(
  snapshot: LospecPaletteSyncSnapshot,
): LospecPaletteSyncCheckpoint {
  return {
    status: snapshot.status,
    nextPage: snapshot.nextPage,
    retryAtMs: snapshot.retryAtMs,
    fetchedPageCount: snapshot.fetchedPageCount,
    addedCount: snapshot.addedCount,
    updatedAt: snapshot.updatedAt,
    errorStatus: snapshot.errorStatus,
    errorMessage: snapshot.errorMessage,
  };
}

function normalizeCheckpoint(
  checkpoint: LospecPaletteSyncCheckpoint | null,
  now: number,
): LospecPaletteSyncCheckpoint | null {
  if (!checkpoint) {
    return null;
  }

  if (checkpoint.status === "complete") {
    return checkpoint;
  }

  if (
    checkpoint.status === "rate-limited" &&
    checkpoint.retryAtMs !== null &&
    checkpoint.retryAtMs > now
  ) {
    return checkpoint;
  }

  return {
    ...checkpoint,
    status: "idle",
    retryAtMs: null,
    errorStatus: undefined,
    errorMessage: undefined,
    updatedAt: now,
  };
}

export function createLospecPaletteSyncController(
  dependencies: LospecPaletteSyncControllerDependencies,
): LospecPaletteSyncController {
  let snapshot = INITIAL_SNAPSHOT;
  let initPromise: Promise<void> | null = null;
  let runPromise: Promise<void> | null = null;
  let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const commit = (nextSnapshot: LospecPaletteSyncSnapshot) => {
    snapshot = nextSnapshot;
    if (snapshot.hasLoaded) {
      dependencies.saveCheckpoint(toCheckpoint(snapshot));
    }
    emit();
  };

  const clearRetry = () => {
    if (retryTimeoutId === null) {
      return;
    }

    dependencies.clearTimeoutImpl(retryTimeoutId);
    retryTimeoutId = null;
  };

  const scheduleRetry = (retryAtMs: number) => {
    clearRetry();

    retryTimeoutId = dependencies.setTimeoutImpl(() => {
      retryTimeoutId = null;
      void start();
    }, Math.max(0, retryAtMs - dependencies.now()));
  };

  const ensureInitialized = async () => {
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      const now = dependencies.now();
      const [palettes, checkpoint] = await Promise.all([
        dependencies.loadCache(),
        Promise.resolve(dependencies.loadCheckpoint()),
      ]);
      const normalizedCheckpoint = normalizeCheckpoint(checkpoint, now);

      snapshot = {
        ...INITIAL_SNAPSHOT,
        ...normalizedCheckpoint,
        palettes,
        hasLoaded: true,
      };

      emit();

      if (snapshot.retryAtMs !== null && snapshot.retryAtMs > dependencies.now()) {
        scheduleRetry(snapshot.retryAtMs);
      }
    })();

    await initPromise;
  };

  const start = async () => {
    if (disposed) {
      return;
    }

    await ensureInitialized();

    if (disposed || runPromise || snapshot.status === "complete") {
      return;
    }

    if (snapshot.retryAtMs !== null && snapshot.retryAtMs > dependencies.now()) {
      scheduleRetry(snapshot.retryAtMs);
      return;
    }

    clearRetry();

    const runStartPage = snapshot.nextPage;
    const baseFetchedPageCount = snapshot.fetchedPageCount;
    const baseAddedCount = snapshot.addedCount;

    commit({
      ...snapshot,
      status: "syncing",
      retryAtMs: null,
      errorStatus: undefined,
      errorMessage: undefined,
      updatedAt: dependencies.now(),
    });

    runPromise = (async () => {
      const result = await dependencies.syncCatalog({
        startPage: runStartPage,
        stopAtKnownPalette: false,
        onProgress: (progress) => {
          if (disposed) {
            return;
          }

          commit({
            ...snapshot,
            palettes: progress.palettes,
            status: "syncing",
            nextPage: progress.page === null ? runStartPage : progress.page + 1,
            retryAtMs: null,
            fetchedPageCount: baseFetchedPageCount + progress.fetchedPageCount,
            addedCount: baseAddedCount + progress.addedCount,
            updatedAt: dependencies.now(),
            errorStatus: undefined,
            errorMessage: undefined,
          });
        },
      });

      if (disposed) {
        return;
      }

      const nextFetchedPageCount =
        baseFetchedPageCount + result.fetchedPageCount;
      const nextAddedCount = baseAddedCount + result.addedCount;

      if (result.status === "synced") {
        commit({
          ...snapshot,
          palettes: result.palettes,
          status: result.reachedEnd ? "complete" : "idle",
          nextPage: runStartPage + result.fetchedPageCount,
          retryAtMs: null,
          fetchedPageCount: nextFetchedPageCount,
          addedCount: nextAddedCount,
          updatedAt: dependencies.now(),
          errorStatus: undefined,
          errorMessage: undefined,
        });
        return;
      }

      if (result.status === "cache-only" && result.errorStatus === 429) {
        const retryAtMs = dependencies.now() + LOSPEC_RATE_LIMIT_RETRY_MS;
        commit({
          ...snapshot,
          palettes: result.palettes,
          status: "rate-limited",
          nextPage: result.retryPage ?? runStartPage,
          retryAtMs,
          fetchedPageCount: nextFetchedPageCount,
          addedCount: nextAddedCount,
          updatedAt: dependencies.now(),
          errorStatus: result.errorStatus,
          errorMessage: result.errorMessage,
        });
        scheduleRetry(retryAtMs);
        return;
      }

      commit({
        ...snapshot,
        palettes: result.palettes,
        status: "error",
        retryAtMs: null,
        fetchedPageCount: nextFetchedPageCount,
        addedCount: nextAddedCount,
        updatedAt: dependencies.now(),
        errorStatus: result.errorStatus,
        errorMessage: result.errorMessage,
      });
    })().finally(() => {
      runPromise = null;
    });

    await runPromise;
  };

  return {
    dispose: () => {
      disposed = true;
      clearRetry();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    start,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const lospecPaletteSyncController = createLospecPaletteSyncController({
  loadCache: loadLospecPaletteCache,
  loadCheckpoint: loadLospecPaletteSyncCheckpoint,
  saveCheckpoint: saveLospecPaletteSyncCheckpoint,
  now: Date.now,
  setTimeoutImpl: globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl: globalThis.clearTimeout.bind(globalThis),
  syncCatalog: syncLospecPaletteCatalog,
});

export function getLospecPaletteSyncSnapshot(): LospecPaletteSyncSnapshot {
  return lospecPaletteSyncController.getSnapshot();
}

export function startLospecPaletteBackgroundSync(): Promise<void> {
  return lospecPaletteSyncController.start();
}

export function subscribeToLospecPaletteSync(
  listener: () => void,
): () => void {
  return lospecPaletteSyncController.subscribe(listener);
}
