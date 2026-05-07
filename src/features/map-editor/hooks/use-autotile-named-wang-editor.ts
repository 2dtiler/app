import { useCallback, useMemo, useState } from "react";
import {
  AUTOTILE_WANG_POSITION_INDEXES,
  type AutotileWangColor,
  type AutotileWangId,
  type AutotileWangPosition,
  type AutotileWangSet,
  type AutotileWangSetType,
} from "@/types";
import {
  assignTileToSelectionTarget,
  createDefaultWangColor,
  createDefaultWangSet,
  createDefaultWangTile,
  deleteWangSetFromAutotileConfig,
  normalizeWangIdForSetType,
} from "@/features/map-editor/lib/autotile-dialog";
import type { UseAutotileNamedWangEditorOptions } from "@/features/map-editor/types/autotile-dialog";

function getNextWangColorIndex(colors: readonly AutotileWangColor[]) {
  return (
    colors.reduce((maximum, color) => Math.max(maximum, color.index), 0) + 1
  );
}

function readDraftProbability(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function clearColorIndex(
  wangId: AutotileWangId,
  colorIndex: number,
): AutotileWangId {
  return wangId.map((value) =>
    value === colorIndex ? 0 : value,
  ) as AutotileWangId;
}

export function useAutotileNamedWangEditor({
  draft,
  fallbackPreset,
  setDraft,
  onSelectTarget,
  onClearSelectionTarget,
}: UseAutotileNamedWangEditorOptions) {
  const [activeWangSetId, setActiveWangSetId] = useState<
    AutotileWangSet["id"] | null
  >(() => draft.wangSets?.[0]?.id ?? null);

  const namedWangSetCount = draft.wangSets?.length ?? 0;
  const namedWangColorCount = useMemo(
    () =>
      (draft.wangSets ?? []).reduce(
        (count, wangSet) => count + wangSet.colors.length,
        0,
      ),
    [draft.wangSets],
  );
  const namedWangTileCount = useMemo(
    () =>
      (draft.wangSets ?? []).reduce(
        (count, wangSet) => count + wangSet.tiles.length,
        0,
      ),
    [draft.wangSets],
  );

  const handleAddWangSet = useCallback(() => {
    const wangSet = createDefaultWangSet((draft.wangSets?.length ?? 0) + 1);

    setDraft((current) => ({
      ...current,
      preset: "wang-named-colors",
      wangSets: [...(current.wangSets ?? []), wangSet],
    }));
    setActiveWangSetId(wangSet.id);
    onClearSelectionTarget();
  }, [draft.wangSets?.length, onClearSelectionTarget, setDraft]);

  const handleDeleteWangSet = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      const nextDraft = deleteWangSetFromAutotileConfig(
        draft,
        wangSetId,
        fallbackPreset,
      );
      const remainingWangSets = nextDraft.wangSets ?? [];

      setDraft((current) =>
        deleteWangSetFromAutotileConfig(current, wangSetId, fallbackPreset),
      );

      if (remainingWangSets.length === 0) {
        setActiveWangSetId(null);
      } else if (
        activeWangSetId === wangSetId ||
        !remainingWangSets.some((wangSet) => wangSet.id === activeWangSetId)
      ) {
        setActiveWangSetId(remainingWangSets[0]?.id ?? null);
      }

      onClearSelectionTarget();
    },
    [activeWangSetId, draft, fallbackPreset, onClearSelectionTarget, setDraft],
  );

  const handleSelectWangSet = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      setActiveWangSetId(wangSetId);
      onClearSelectionTarget();
    },
    [onClearSelectionTarget],
  );

  const handleUpdateWangSetName = useCallback(
    (wangSetId: AutotileWangSet["id"], name: string) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId ? { ...wangSet, name } : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleUpdateWangSetType = useCallback(
    (wangSetId: AutotileWangSet["id"], type: AutotileWangSetType) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                type,
                tiles: wangSet.tiles.map((wangTile) => ({
                  ...wangTile,
                  wangId: normalizeWangIdForSetType(wangTile.wangId, type),
                })),
              }
            : wangSet,
        ),
      }));
      onClearSelectionTarget();
    },
    [onClearSelectionTarget, setDraft],
  );

  const handleSelectWangSetTile = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      onSelectTarget({ type: "wangSetTile", wangSetId });
    },
    [onSelectTarget],
  );

  const handleClearWangSetTile = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      setDraft((current) =>
        assignTileToSelectionTarget(
          current,
          { type: "wangSetTile", wangSetId },
          null,
        ),
      );
    },
    [setDraft],
  );

  const handleAddWangColor = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                colors: [
                  ...wangSet.colors,
                  createDefaultWangColor(getNextWangColorIndex(wangSet.colors)),
                ],
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleDeleteWangColor = useCallback(
    (wangSetId: AutotileWangSet["id"], colorIndex: number) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                colors: wangSet.colors.filter(
                  (color) => color.index !== colorIndex,
                ),
                tiles: wangSet.tiles.map((wangTile) => ({
                  ...wangTile,
                  wangId: clearColorIndex(wangTile.wangId, colorIndex),
                })),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleUpdateWangColorName = useCallback(
    (wangSetId: AutotileWangSet["id"], colorIndex: number, name: string) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                colors: wangSet.colors.map((color) =>
                  color.index === colorIndex ? { ...color, name } : color,
                ),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleUpdateWangColorValue = useCallback(
    (wangSetId: AutotileWangSet["id"], colorIndex: number, color: string) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                colors: wangSet.colors.map((wangColor) =>
                  wangColor.index === colorIndex
                    ? { ...wangColor, color }
                    : wangColor,
                ),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleUpdateWangColorProbability = useCallback(
    (
      wangSetId: AutotileWangSet["id"],
      colorIndex: number,
      probability: number,
    ) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                colors: wangSet.colors.map((color) =>
                  color.index === colorIndex
                    ? {
                        ...color,
                        probability: readDraftProbability(probability),
                      }
                    : color,
                ),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleSelectWangColorTile = useCallback(
    (wangSetId: AutotileWangSet["id"], colorIndex: number) => {
      onSelectTarget({ type: "wangColorTile", wangSetId, colorIndex });
    },
    [onSelectTarget],
  );

  const handleClearWangColorTile = useCallback(
    (wangSetId: AutotileWangSet["id"], colorIndex: number) => {
      setDraft((current) =>
        assignTileToSelectionTarget(
          current,
          { type: "wangColorTile", wangSetId, colorIndex },
          null,
        ),
      );
    },
    [setDraft],
  );

  const handleAddWangTile = useCallback(
    (wangSetId: AutotileWangSet["id"]) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                tiles: [...wangSet.tiles, createDefaultWangTile(wangSet.type)],
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleDeleteWangTile = useCallback(
    (wangSetId: AutotileWangSet["id"], tileIndex: number) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                tiles: wangSet.tiles.filter((_, index) => index !== tileIndex),
              }
            : wangSet,
        ),
      }));
      onClearSelectionTarget();
    },
    [onClearSelectionTarget, setDraft],
  );

  const handleSelectWangTile = useCallback(
    (wangSetId: AutotileWangSet["id"], tileIndex: number) => {
      onSelectTarget({ type: "wangTile", wangSetId, tileIndex });
    },
    [onSelectTarget],
  );

  const handleClearWangTile = useCallback(
    (wangSetId: AutotileWangSet["id"], tileIndex: number) => {
      setDraft((current) =>
        assignTileToSelectionTarget(
          current,
          { type: "wangTile", wangSetId, tileIndex },
          null,
        ),
      );
    },
    [setDraft],
  );

  const handleUpdateWangTileProbability = useCallback(
    (
      wangSetId: AutotileWangSet["id"],
      tileIndex: number,
      probability: number,
    ) => {
      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                tiles: wangSet.tiles.map((wangTile, index) =>
                  index === tileIndex
                    ? {
                        ...wangTile,
                        probability: readDraftProbability(probability),
                      }
                    : wangTile,
                ),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  const handleUpdateWangTileColor = useCallback(
    (
      wangSetId: AutotileWangSet["id"],
      tileIndex: number,
      position: AutotileWangPosition,
      colorIndex: number,
    ) => {
      const positionIndex = AUTOTILE_WANG_POSITION_INDEXES[position];

      setDraft((current) => ({
        ...current,
        wangSets: (current.wangSets ?? []).map((wangSet) =>
          wangSet.id === wangSetId
            ? {
                ...wangSet,
                tiles: wangSet.tiles.map((wangTile, index) => {
                  if (index !== tileIndex) {
                    return wangTile;
                  }

                  const wangId = [...wangTile.wangId] as AutotileWangId;
                  wangId[positionIndex] = colorIndex;

                  return { ...wangTile, wangId };
                }),
              }
            : wangSet,
        ),
      }));
    },
    [setDraft],
  );

  return {
    activeWangSetId,
    setActiveWangSetId,
    namedWangSetCount,
    namedWangColorCount,
    namedWangTileCount,
    handleAddWangSet,
    handleDeleteWangSet,
    handleSelectWangSet,
    handleUpdateWangSetName,
    handleUpdateWangSetType,
    handleSelectWangSetTile,
    handleClearWangSetTile,
    handleAddWangColor,
    handleDeleteWangColor,
    handleUpdateWangColorName,
    handleUpdateWangColorValue,
    handleUpdateWangColorProbability,
    handleSelectWangColorTile,
    handleClearWangColorTile,
    handleAddWangTile,
    handleDeleteWangTile,
    handleSelectWangTile,
    handleClearWangTile,
    handleUpdateWangTileProbability,
    handleUpdateWangTileColor,
  };
}
