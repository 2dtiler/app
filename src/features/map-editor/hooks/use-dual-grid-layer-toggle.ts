import { useState } from "react";
import type { DualGridLayerDialogTarget } from "@/features/map-editor/types/layers-panel";
import type { EditorState, TileLayer } from "@/types";

export function useDualGridLayerToggle(
  layers: TileLayer[],
  setState: (recipe: (draft: EditorState) => void) => void,
) {
  const [dualGridTarget, setDualGridTarget] =
    useState<DualGridLayerDialogTarget | null>(null);

  function handleRequestToggleDualGrid(layerId: string) {
    const layer = layers.find((candidate) => candidate.id === layerId);
    if (!layer) {
      return;
    }

    const enabling = layer.tilingMode !== "dual-grid";
    const hasTiles = Object.keys(layer.tiles).length > 0;

    if (enabling && !hasTiles) {
      setState((draft) => {
        const nextLayer = draft.project?.layers.find(
          (candidate) => candidate.id === layerId,
        );
        if (!nextLayer) {
          return;
        }

        nextLayer.tilingMode = "dual-grid";
        nextLayer.tiles = {};
        nextLayer.logicalTerrains = {};
      });
      return;
    }

    setDualGridTarget({
      layerId,
      name: layer.name,
      enabling,
      hasTiles,
    });
  }

  function handleConfirmDualGridToggle() {
    if (!dualGridTarget) {
      return;
    }

    const { layerId, enabling } = dualGridTarget;
    setState((draft) => {
      const layer = draft.project?.layers.find(
        (candidate) => candidate.id === layerId,
      );
      if (!layer) {
        return;
      }

      if (enabling) {
        layer.tilingMode = "dual-grid";
        layer.tiles = {};
        layer.logicalTerrains = {};
        return;
      }

      layer.tilingMode = "standard";
      layer.tiles = {};
      delete layer.logicalTerrains;
    });
    setDualGridTarget(null);
  }

  return {
    dualGridTarget,
    handleConfirmDualGridToggle,
    handleRequestToggleDualGrid,
    setDualGridTarget,
  };
}
