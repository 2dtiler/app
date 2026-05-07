import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type DragEvent,
  useSyncExternalStore,
} from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TilesetCanvas } from "./TilesetCanvas";
import { TilesetPanelDialogs } from "./TilesetPanel/TilesetPanelDialogs";
import { TilesetFileInput } from "./TilesetPanel/TilesetFileInput";
import { TilesetPanelOverlays } from "./TilesetPanel/TilesetPanelOverlays";
import { TilesetPanelTabs } from "./TilesetPanel/TilesetPanelTabs";
import { TilesetToolbar } from "./TilesetToolbar";
import { AnimationsStrip } from "@/features/map-editor/components/animations/AnimationsStrip";
import { evictTileset } from "@/features/map-editor/components/MapCanvas/texture-cache";
import {
  getAdjacentGroupedItemId,
  moveGroupedItem,
  moveOrderedGroup,
  reindexOrderedGroups,
} from "@/features/map-editor/lib/asset-manager";
import { getPaintableAutotileTerrainById } from "@/features/map-editor/lib/autotile";
import { syncActiveTilesetState } from "@/features/map-editor/lib/tileset-panel-state";
import { isTilesetImageFile } from "@/features/map-editor/lib/tileset-image-import";
import {
  getTilesetPlacementCanvasSize,
  mergeTilesetImageAtPosition,
  snapTilesetPlacementPosition,
} from "@/features/map-editor/lib/tileset-image-merge";
import {
  createEmptyAnimationConfig,
  getTilesetAnimations,
  normalizeTilesetAnimationConfig,
} from "@/features/map-editor/lib/tileset-animations";
import { useTilesetImageImport } from "@/features/map-editor/hooks/use-tileset-image-import";
import { useEditorStore } from "@/hooks/use-editor-store";
import { zoomStore } from "@/store/zoom-store";
import { saveAsset, getAsset, deleteAsset } from "@/services/db";
import { getTilesetTileSize } from "@/features/project-management/lib/project";
import {
  generateTilesetId,
  generateTilesetGroupId,
  generateAssetId,
} from "@/utils/ids";
import {
  type TileSize,
  type TilesetGroupId,
  type TilesetId,
  type Tileset,
  type TilesetGroup,
  type TilesetAnimation,
} from "@/types";
import type { TileRegion } from "@/features/map-editor/types/editor-ui";
import type {
  TilesetDeleteTarget,
  TilesetPanelProps,
} from "@/features/map-editor/types/tileset-panel";
import type {
  PendingTilesetImageImport,
  TilesetImageImportPosition,
  TilesetPlacementPreview,
} from "@/features/map-editor/types/tileset-import";

export function TilesetPanel({
  quickExportControl,
  onImportTilesetFromFile,
}: TilesetPanelProps) {
  const { state, setState } = useEditorStore();
  const { tilesetZoom } = useSyncExternalStore(
    zoomStore.subscribe,
    zoomStore.getSnapshot,
  );
  const {
    pendingImport,
    mode: imageImportMode,
    placementPosition,
    isLoading: isImageImportLoading,
    isCommitting: isImageImportCommitting,
    error: imageImportError,
    queueImageFile,
    beginPlacement,
    updatePlacementPosition,
    setCommitting: setImageImportCommitting,
    setError: setImageImportError,
    reset: resetImageImport,
  } = useTilesetImageImport();
  const project = state.project;
  const projectId = project?.id ?? null;

  const [deleteTarget, setDeleteTarget] = useState<TilesetDeleteTarget | null>(
    null,
  );
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [autotileDialogOpen, setAutotileDialogOpen] = useState(false);
  const [animationsVisible, setAnimationsVisible] = useState(false);
  const [animationDialogOpen, setAnimationDialogOpen] = useState(false);
  const [editingAnimation, setEditingAnimation] =
    useState<TilesetAnimation | null>(null);
  const [manageTilesetsOpen, setManageTilesetsOpen] = useState(false);
  const [manageTilesetsSelectedGroupId, setManageTilesetsSelectedGroupId] =
    useState<TilesetGroupId | null>(null);
  const [tilesetImportTargetGroupId, setTilesetImportTargetGroupId] =
    useState<TilesetGroupId | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<TilesetId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    zoomStore.setActiveTileset(projectId ? state.activeTilesetId : null);
  }, [projectId, state.activeTilesetId]);

  const activeGroup = project?.tilesetGroups.find(
    (g) => g.id === state.activeTilesetGroupId,
  );
  const orderedTilesetGroups = [...(project?.tilesetGroups ?? [])].sort(
    (left, right) => left.order - right.order,
  );
  const groupTilesets =
    project?.tilesets.filter((t) => t.groupId === state.activeTilesetGroupId) ??
    [];
  const resolvedManageTilesetsSelectedGroupId = orderedTilesetGroups.some(
    (group) => group.id === manageTilesetsSelectedGroupId,
  )
    ? manageTilesetsSelectedGroupId
    : (orderedTilesetGroups[0]?.id ?? null);
  const manageTilesetGroups = orderedTilesetGroups.map((group) => {
    const itemCount =
      project?.tilesets.filter((tileset) => tileset.groupId === group.id)
        .length ?? 0;
    const isLastGroup = orderedTilesetGroups.length <= 1;

    return {
      id: group.id,
      name: group.name,
      itemCount,
      canDelete: !isLastGroup && itemCount === 0,
      deleteDisabledReason: isLastGroup
        ? "Projects must keep at least one tileset group."
        : itemCount > 0
          ? "Move or delete all tilesets in this group first."
          : undefined,
    };
  });
  const manageTilesetItems =
    project?.tilesets
      .filter(
        (tileset) => tileset.groupId === resolvedManageTilesetsSelectedGroupId,
      )
      .map((tileset) => ({
        id: tileset.id,
        name: tileset.name,
        subtitle: `${tileset.imageWidth} × ${tileset.imageHeight} px`,
      })) ?? [];
  const activeTileset = project?.tilesets.find(
    (t) => t.id === state.activeTilesetId,
  );
  const activeTileSize = getTilesetTileSize(
    activeTileset,
    project?.tileSize ?? state.tileSize,
  );
  const activeAnimations = getTilesetAnimations(activeTileset);
  const activeAnimationId =
    activeTileset && state.selectedAnimation?.tilesetId === activeTileset.id
      ? state.selectedAnimation.animationId
      : null;

  const canvasSelectedTile =
    activeTileset && state.selectedTile?.tilesetId === activeTileset.id
      ? {
          sx: state.selectedTile.sx,
          sy: state.selectedTile.sy,
          sw: state.selectedTile.sw,
          sh: state.selectedTile.sh,
        }
      : null;

  const handleTileSelect = useCallback(
    (tile: TileRegion) => {
      if (!activeTileset) return;
      setState((draft) => {
        draft.selectedTile = { tilesetId: activeTileset.id, ...tile };
        draft.selectedAnimation = null;
        if (
          draft.currentTool === "select" ||
          draft.currentTool === "animation"
        ) {
          draft.currentTool = "paint";
        }
      });
    },
    [activeTileset, setState],
  );

  const handleSetTilesetZoom = useCallback((newZoom: number) => {
    zoomStore.setTilesetZoom(newZoom);
  }, []);

  const placementPreview: TilesetPlacementPreview | null =
    pendingImport && imageImportMode === "placement"
      ? {
          image: pendingImport.image,
          position: placementPosition,
          width: pendingImport.width,
          height: pendingImport.height,
        }
      : null;
  const placementCanvasSize =
    activeTileset && pendingImport
      ? getTilesetPlacementCanvasSize(
          activeTileset.imageWidth,
          activeTileset.imageHeight,
          pendingImport.width,
          pendingImport.height,
          placementPosition,
        )
      : null;
  const isImageImportBusy = isImageImportLoading || isImageImportCommitting;

  const handlePlacementPositionChange = useCallback(
    (position: TilesetImageImportPosition) => {
      updatePlacementPosition(
        snapTilesetPlacementPosition(position, activeTileSize),
      );
    },
    [activeTileSize, updatePlacementPosition],
  );

  if (!project) return null;

  function openManageTilesetsDialog(
    groupId: TilesetGroupId | null = state.activeTilesetGroupId,
  ) {
    setManageTilesetsSelectedGroupId(
      groupId ?? orderedTilesetGroups[0]?.id ?? null,
    );
    setManageTilesetsOpen(true);
  }

  function handleResetImageImport() {
    setTilesetImportTargetGroupId(null);
    resetImageImport();
  }

  async function handleAddTileset(
    targetGroupId: TilesetGroupId | null = state.activeTilesetGroupId,
  ) {
    setTilesetImportTargetGroupId(targetGroupId);
    fileInputRef.current?.click();
  }

  async function createTilesetFromPendingImport(
    importToCreate: PendingTilesetImageImport | null = pendingImport,
    targetGroupIdOverride: TilesetGroupId | null = tilesetImportTargetGroupId,
  ) {
    if (!importToCreate) return;
    if (!project) return;

    const targetGroupId =
      targetGroupIdOverride ?? activeGroup?.id ?? project.tilesetGroups[0]?.id;
    if (!targetGroupId) {
      setImageImportError("Create a tileset group first.");
      return;
    }

    setImageImportCommitting(true);
    setImageImportError(null);

    try {
      const assetId = generateAssetId();
      await saveAsset(assetId, importToCreate.buffer, importToCreate.mimeType);

      const tilesetId = generateTilesetId();
      const name = importToCreate.name;

      setState((draft) => {
        if (!draft.project) return;
        const tileset: Tileset = {
          id: tilesetId,
          name,
          groupId: targetGroupId,
          tileSize: activeTileSize,
          assetId,
          imageWidth: importToCreate.width,
          imageHeight: importToCreate.height,
          createdAt: Date.now(),
        };
        draft.project.tilesets.push(tileset);
        draft.activeTilesetGroupId = targetGroupId;
        syncActiveTilesetState(draft, tilesetId);
      });
      handleResetImageImport();
      setManageTilesetsSelectedGroupId(targetGroupId);
    } catch (caughtError) {
      console.error("[Tileset Image Import] Failed:", caughtError);
      setImageImportError("Failed to create the tileset.");
    } finally {
      setImageImportCommitting(false);
    }
  }

  function beginPendingTilesetPlacement() {
    if (!activeTileset) {
      setImageImportError("Select a tileset first.");
      return;
    }
    beginPlacement();
  }

  async function commitPendingTilesetPlacement() {
    if (!pendingImport || !activeTileset) return;

    setImageImportCommitting(true);
    setImageImportError(null);

    try {
      const snappedPosition = snapTilesetPlacementPosition(
        placementPosition,
        activeTileSize,
      );
      const result = await mergeTilesetImageAtPosition({
        targetTileset: activeTileset,
        sourceImage: pendingImport.image,
        sourceWidth: pendingImport.width,
        sourceHeight: pendingImport.height,
        position: snappedPosition,
      });

      evictTileset(activeTileset.id);
      setState((draft) => {
        const tileset = draft.project?.tilesets.find(
          (candidate) => candidate.id === activeTileset.id,
        );
        if (!tileset) return;

        tileset.assetId = result.assetId;
        tileset.imageWidth = result.width;
        tileset.imageHeight = result.height;
        syncActiveTilesetState(draft, activeTileset.id);
      });
      handleResetImageImport();
    } catch (caughtError) {
      console.error("[Tileset Image Merge] Failed:", caughtError);
      setImageImportError("Failed to add the image to the active tileset.");
    } finally {
      setImageImportCommitting(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const showChoiceDialog =
      !tilesetImportTargetGroupId && Boolean(activeTileset);

    if (file) {
      if (isTilesetImageFile(file)) {
        const nextPendingImport = await queueImageFile(file, {
          showChoiceDialog,
        });
        if (nextPendingImport && !activeTileset) {
          await createTilesetFromPendingImport(nextPendingImport);
        }
      } else {
        await onImportTilesetFromFile(file);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function hasFileData(dataTransfer: DataTransfer): boolean {
    return Array.from(dataTransfer.items ?? []).some(
      (item) => item.kind === "file",
    );
  }

  function handleCanvasDragOver(e: DragEvent<HTMLDivElement>) {
    if (!hasFileData(e.dataTransfer)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDropTargetActive(true);
  }

  function handleCanvasDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDropTargetActive(false);
  }

  async function handleCanvasDrop(e: DragEvent<HTMLDivElement>) {
    const file = e.dataTransfer.files[0];
    if (!file) return;

    e.preventDefault();
    setIsDropTargetActive(false);
    if (isTilesetImageFile(file)) {
      const nextPendingImport = await queueImageFile(file, {
        showChoiceDialog: !tilesetImportTargetGroupId && Boolean(activeTileset),
      });
      if (nextPendingImport && !activeTileset) {
        await createTilesetFromPendingImport(nextPendingImport);
      }
    } else {
      await onImportTilesetFromFile(file);
    }
  }

  function handleGroupChange(value: string) {
    if (value === "__add__") {
      setAddGroupOpen(true);
      setNewGroupName("");
    } else if (value === "__manage__") {
      openManageTilesetsDialog();
    } else {
      setState((draft) => {
        draft.activeTilesetGroupId = value as TilesetGroupId;
        const firstInGroup = draft.project?.tilesets.find(
          (t) => t.groupId === value,
        );
        syncActiveTilesetState(draft, firstInGroup?.id ?? null);
      });
    }
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const id = generateTilesetGroupId();
    setState((draft) => {
      if (!draft.project) return;
      const group: TilesetGroup = {
        id,
        name,
        order: draft.project.tilesetGroups.length,
      };
      draft.project.tilesetGroups.push(group);
      reindexOrderedGroups(draft.project.tilesetGroups);
      draft.activeTilesetGroupId = id;
      syncActiveTilesetState(draft, null);
    });
    setAddGroupOpen(false);
    setManageTilesetsSelectedGroupId(id);
  }

  function handleRenameTilesetGroup(groupId: TilesetGroupId, name: string) {
    setState((draft) => {
      const group = draft.project?.tilesetGroups.find(
        (entry) => entry.id === groupId,
      );
      if (group) {
        group.name = name;
      }
    });
  }

  function handleRenameManagedTileset(tilesetId: TilesetId, name: string) {
    setState((draft) => {
      const tileset = draft.project?.tilesets.find(
        (entry) => entry.id === tilesetId,
      );
      if (tileset) {
        tileset.name = name;
      }
    });
  }

  function handleDeleteEmptyTilesetGroup(groupId: TilesetGroupId) {
    const groupIndex = orderedTilesetGroups.findIndex(
      (group) => group.id === groupId,
    );
    const remainingGroups = orderedTilesetGroups.filter(
      (group) => group.id !== groupId,
    );
    const fallbackGroupId =
      remainingGroups[Math.min(groupIndex, remainingGroups.length - 1)]?.id ??
      remainingGroups[0]?.id ??
      null;

    setState((draft) => {
      if (!draft.project) return;
      if (draft.project.tilesetGroups.length <= 1) return;
      if (draft.project.tilesets.some((tileset) => tileset.groupId === groupId))
        return;

      draft.project.tilesetGroups = draft.project.tilesetGroups.filter(
        (group) => group.id !== groupId,
      );
      reindexOrderedGroups(draft.project.tilesetGroups);

      if (draft.activeTilesetGroupId === groupId) {
        draft.activeTilesetGroupId = fallbackGroupId as TilesetGroupId | null;
        const firstInGroup = fallbackGroupId
          ? draft.project.tilesets.find(
              (tileset) => tileset.groupId === fallbackGroupId,
            )
          : null;
        syncActiveTilesetState(draft, firstInGroup?.id ?? null);
      }
    });

    setManageTilesetsSelectedGroupId(fallbackGroupId as TilesetGroupId | null);
  }

  function handleReorderTilesetGroups(
    dragId: TilesetGroupId,
    targetId: TilesetGroupId,
    position: "above" | "below",
  ) {
    setState((draft) => {
      if (!draft.project) return;
      const nextGroups = [...draft.project.tilesetGroups].sort(
        (left, right) => left.order - right.order,
      );
      if (!moveOrderedGroup(nextGroups, dragId, targetId, position)) {
        return;
      }

      draft.project.tilesetGroups = nextGroups;
    });
  }

  function handleMoveTilesetToGroup(
    tilesetId: TilesetId,
    targetGroupId: TilesetGroupId,
  ) {
    setState((draft) => {
      if (!draft.project) return;
      if (
        !moveGroupedItem(draft.project.tilesets, tilesetId, {
          targetGroupId,
        })
      ) {
        return;
      }

      if (draft.activeTilesetId === tilesetId) {
        draft.activeTilesetGroupId = targetGroupId;
      }
    });

    setManageTilesetsSelectedGroupId(targetGroupId);
  }

  function handleReorderTilesets(
    dragId: TilesetId,
    targetId: TilesetId,
    position: "above" | "below",
  ) {
    setState((draft) => {
      if (!draft.project) return;

      const targetTileset = draft.project.tilesets.find(
        (entry) => entry.id === targetId,
      );
      if (!targetTileset) {
        return;
      }

      if (
        !moveGroupedItem(draft.project.tilesets, dragId, {
          targetGroupId: targetTileset.groupId,
          targetItemId: targetId,
          position,
        })
      ) {
        return;
      }

      if (draft.activeTilesetId === dragId) {
        draft.activeTilesetGroupId = targetTileset.groupId;
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "tileset") {
      // Find asset to clean up
      const tileset = project?.tilesets.find((t) => t.id === deleteTarget.id);
      const nextTilesetId = tileset
        ? getAdjacentGroupedItemId(project?.tilesets ?? [], deleteTarget.id)
        : null;
      if (tileset) {
        void deleteAsset(tileset.assetId);
      }
      setState((draft) => {
        if (!draft.project) return;
        draft.project.tilesets = draft.project.tilesets.filter(
          (t) => t.id !== deleteTarget.id,
        );
        if (draft.activeTilesetId === deleteTarget.id) {
          syncActiveTilesetState(draft, nextTilesetId as TilesetId | null);
        }
        if (draft.selectedTile?.tilesetId === deleteTarget.id) {
          draft.selectedTile = null;
        }
        if (draft.selectedAutotileTerrain?.tilesetId === deleteTarget.id) {
          draft.selectedAutotileTerrain = null;
        }
        if (draft.selectedAnimation?.tilesetId === deleteTarget.id) {
          draft.selectedAnimation = null;
        }
      });
    } else {
      // Clean up assets for all tilesets in the group
      const tilesetsInGroup =
        project?.tilesets.filter((t) => t.groupId === deleteTarget.id) ?? [];
      for (const ts of tilesetsInGroup) {
        void deleteAsset(ts.assetId);
      }
      setState((draft) => {
        if (!draft.project) return;
        draft.project.tilesetGroups = draft.project.tilesetGroups.filter(
          (g) => g.id !== deleteTarget.id,
        );
        reindexOrderedGroups(draft.project.tilesetGroups);
        draft.project.tilesets = draft.project.tilesets.filter(
          (t) => t.groupId !== deleteTarget.id,
        );
        if (draft.activeTilesetGroupId === deleteTarget.id) {
          draft.activeTilesetGroupId =
            draft.project.tilesetGroups[0]?.id ?? null;
          const firstInGroup = draft.activeTilesetGroupId
            ? draft.project.tilesets.find(
                (tileset) => tileset.groupId === draft.activeTilesetGroupId,
              )
            : null;
          syncActiveTilesetState(draft, firstInGroup?.id ?? null);
        }
      });
    }
    setDeleteTarget(null);
  }

  function handleTabDoubleClick(tileset: Tileset) {
    setRenamingTabId(tileset.id);
    setRenameValue(tileset.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function commitRename() {
    if (!renamingTabId) return;
    const name = renameValue.trim();
    if (name) {
      handleRenameManagedTileset(renamingTabId, name);
    }
    setRenamingTabId(null);
  }

  async function handleDuplicateTileset(source: Tileset) {
    // Duplicate the asset blob
    const asset = await getAsset(source.assetId);
    if (!asset) return;
    const newAssetId = generateAssetId();
    await saveAsset(newAssetId, asset.data, asset.mimeType);

    const newTilesetId = generateTilesetId();
    setState((draft) => {
      if (!draft.project) return;
      const tileset: Tileset = {
        id: newTilesetId,
        name: `${source.name}_copy`,
        groupId: source.groupId,
        tileSize: source.tileSize,
        assetId: newAssetId,
        imageWidth: source.imageWidth,
        imageHeight: source.imageHeight,
        autotile: source.autotile
          ? (JSON.parse(JSON.stringify(source.autotile)) as Tileset["autotile"])
          : undefined,
        animations: source.animations
          ? (JSON.parse(
              JSON.stringify(source.animations),
            ) as Tileset["animations"])
          : undefined,
        createdAt: Date.now(),
      };
      draft.project.tilesets.push(tileset);
      syncActiveTilesetState(draft, newTilesetId);
    });
  }

  function handleTileSizeChange(value: string) {
    const tileSize = Number(value) as TileSize;
    setState((draft) => {
      const activeTileset = draft.project?.tilesets.find(
        (tileset) => tileset.id === draft.activeTilesetId,
      );
      if (activeTileset) {
        activeTileset.tileSize = tileSize;
      } else if (draft.project) {
        draft.project.tileSize = tileSize;
      }
      draft.tileSize = tileSize;
      draft.selectedTile = null;
      draft.selectedAnimation = null;
    });
  }

  function handleZoom(direction: 1 | -1) {
    zoomStore.setTilesetZoom(tilesetZoom + direction * 0.5);
  }

  function handleSaveAutotile(autotile: NonNullable<Tileset["autotile"]>) {
    if (!activeTileset) {
      return;
    }

    setState((draft) => {
      const tileset = draft.project?.tilesets.find(
        (candidate) => candidate.id === activeTileset.id,
      );
      if (!tileset) {
        return;
      }

      tileset.autotile = autotile;
      if (
        draft.selectedAutotileTerrain?.tilesetId === activeTileset.id &&
        !getPaintableAutotileTerrainById(
          autotile,
          draft.selectedAutotileTerrain.terrainId,
        )
      ) {
        draft.selectedAutotileTerrain = null;
      }
    });
  }

  function handleOpenNewAnimation() {
    setEditingAnimation(null);
    setAnimationDialogOpen(true);
  }

  function handleOpenEditAnimation(animation: TilesetAnimation) {
    setEditingAnimation(animation);
    setAnimationDialogOpen(true);
  }

  function handleSaveAnimation(animation: TilesetAnimation) {
    if (!activeTileset) {
      return;
    }

    setState((draft) => {
      const tileset = draft.project?.tilesets.find(
        (candidate) => candidate.id === activeTileset.id,
      );
      if (!tileset) return;

      const config = normalizeTilesetAnimationConfig(
        tileset.animations ?? createEmptyAnimationConfig(),
      );
      const existingIndex = config.animations.findIndex(
        (candidate) => candidate.id === animation.id,
      );

      if (existingIndex >= 0) {
        config.animations[existingIndex] = animation;
      } else {
        config.animations.push(animation);
      }

      tileset.animations = config;
      draft.currentTool = "animation";
      draft.selectedTile = null;
      draft.selectedAutotileTerrain = null;
      draft.selectedAnimation = {
        tilesetId: tileset.id,
        animationId: animation.id,
      };
    });
  }

  function handleSelectAnimation(animation: TilesetAnimation) {
    if (!activeTileset) return;

    setState((draft) => {
      draft.currentTool = "animation";
      draft.selectedTile = null;
      draft.selectedAutotileTerrain = null;
      draft.selectedAnimation = {
        tilesetId: activeTileset.id,
        animationId: animation.id,
      };
    });
  }

  function handleDeleteAnimation(animation: TilesetAnimation) {
    if (!activeTileset) return;

    setState((draft) => {
      const tileset = draft.project?.tilesets.find(
        (candidate) => candidate.id === activeTileset.id,
      );
      if (!tileset?.animations) return;

      tileset.animations.animations = tileset.animations.animations.filter(
        (candidate) => candidate.id !== animation.id,
      );

      for (const layer of draft.project?.layers ?? []) {
        for (const ref of Object.values(layer.tiles)) {
          if (
            ref.tilesetId === activeTileset.id &&
            ref.animationId === animation.id
          ) {
            delete ref.animationId;
            delete ref.animationCellIndex;
          }
        }
      }

      if (draft.selectedAnimation?.animationId === animation.id) {
        draft.selectedAnimation = null;
        if (draft.currentTool === "animation") {
          draft.currentTool = "paint";
        }
      }
    });
  }

  return (
    <div className="flex flex-col h-full">
      <TilesetToolbar
        project={project}
        activeTileSize={activeTileSize}
        activeTileset={activeTileset ?? null}
        animationsVisible={animationsVisible}
        tilesetZoom={tilesetZoom}
        onTileSizeChange={handleTileSizeChange}
        onZoom={handleZoom}
        onOpenAutotile={() => setAutotileDialogOpen(true)}
        onAnimationsVisibleChange={setAnimationsVisible}
      />

      <TilesetPanelTabs
        activeGroup={activeGroup}
        groupTilesets={groupTilesets}
        onAddTileset={() => void handleAddTileset()}
        onCancelRename={() => setRenamingTabId(null)}
        onCommitRename={commitRename}
        onDuplicateTileset={(tileset) => {
          void handleDuplicateTileset(tileset);
        }}
        onGroupChange={handleGroupChange}
        onRequestDeleteTarget={setDeleteTarget}
        onSelectTileset={(tilesetId) =>
          setState((draft) => {
            syncActiveTilesetState(draft, tilesetId as TilesetId);
          })
        }
        onStartRenamingTab={handleTabDoubleClick}
        project={project}
        renameInputRef={renameInputRef}
        renameValue={renameValue}
        renamingTabId={renamingTabId}
        setRenameValue={setRenameValue}
        state={state}
      />

      <div
        className="relative flex-1 min-h-0 flex flex-col overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        {animationsVisible && activeTileset ? (
          <Group orientation="horizontal" id="tileset-animation-layout">
            <Panel defaultSize="24%" minSize="16%" maxSize="46%">
              <AnimationsStrip
                activeAnimationId={activeAnimationId}
                animations={activeAnimations}
                onAddAnimation={handleOpenNewAnimation}
                onDeleteAnimation={handleDeleteAnimation}
                onEditAnimation={handleOpenEditAnimation}
                onSelectAnimation={handleSelectAnimation}
                tileset={activeTileset}
              />
            </Panel>
            <Separator
              aria-label="Resize animations and tileset panels"
              className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
            />
            <Panel defaultSize="76%" minSize="35%">
              <TilesetCanvas
                assetId={activeTileset.assetId}
                tileSize={activeTileSize}
                zoom={tilesetZoom}
                onZoomChange={handleSetTilesetZoom}
                selectedTile={canvasSelectedTile}
                onTileSelect={handleTileSelect}
                selectionMode="rectangle"
                className="h-full min-h-0"
                placementPreview={placementPreview}
                onPlacementChange={handlePlacementPositionChange}
              />
            </Panel>
          </Group>
        ) : (
          <TilesetCanvas
            assetId={activeTileset?.assetId ?? null}
            tileSize={activeTileSize}
            zoom={tilesetZoom}
            onZoomChange={handleSetTilesetZoom}
            selectedTile={canvasSelectedTile}
            onTileSelect={handleTileSelect}
            selectionMode="rectangle"
            className="flex-1 min-h-0"
            placementPreview={placementPreview}
            onPlacementChange={handlePlacementPositionChange}
            placeholder={
              groupTilesets.length === 0
                ? "Click '+ Add Tileset' to add a tileset"
                : "Select a tileset tab"
            }
          />
        )}
        <TilesetPanelOverlays
          activeTileSize={activeTileSize}
          activeTileset={activeTileset ?? null}
          imageImportError={imageImportError}
          imageImportMode={imageImportMode}
          isDropTargetActive={isDropTargetActive}
          isImageImportBusy={isImageImportBusy}
          pendingImport={pendingImport}
          placementCanvasSize={placementCanvasSize}
          placementPosition={placementPosition}
          quickExportControl={quickExportControl}
          onAddToExisting={beginPendingTilesetPlacement}
          onCancel={handleResetImageImport}
          onCreateNew={createTilesetFromPendingImport}
          onPlace={commitPendingTilesetPlacement}
          onPositionChange={handlePlacementPositionChange}
        />
      </div>

      <TilesetFileInput
        fileInputRef={fileInputRef}
        onChange={(event) => {
          void handleFileSelected(event);
        }}
      />

      <TilesetPanelDialogs
        activeTileset={activeTileset ?? null}
        addGroupOpen={addGroupOpen}
        animationDialogOpen={animationDialogOpen}
        autotileDialogOpen={autotileDialogOpen}
        deleteTarget={deleteTarget}
        editingAnimation={editingAnimation}
        manageTilesetGroups={manageTilesetGroups}
        manageTilesetItems={manageTilesetItems}
        manageTilesetsOpen={manageTilesetsOpen}
        manageTilesetsSelectedGroupId={resolvedManageTilesetsSelectedGroupId}
        newGroupName={newGroupName}
        onCreateGroup={handleCreateGroup}
        onCreateTileset={(groupId) => {
          void handleAddTileset(groupId);
        }}
        onDeleteConfirm={handleDeleteConfirm}
        onDeleteEmptyGroup={handleDeleteEmptyTilesetGroup}
        onDeleteTileset={(tilesetId) => {
          const tileset = project.tilesets.find(
            (entry) => entry.id === tilesetId,
          );
          if (!tileset) {
            return;
          }

          setDeleteTarget({
            type: "tileset",
            id: tileset.id,
            name: tileset.name,
          });
        }}
        onMoveTilesetToGroup={handleMoveTilesetToGroup}
        onRenameGroup={handleRenameTilesetGroup}
        onRenameTileset={handleRenameManagedTileset}
        onReorderGroups={handleReorderTilesetGroups}
        onReorderTilesets={handleReorderTilesets}
        onSaveAnimation={handleSaveAnimation}
        onSaveAutotile={handleSaveAutotile}
        setAddGroupOpen={setAddGroupOpen}
        setAnimationDialogOpen={setAnimationDialogOpen}
        setAutotileDialogOpen={setAutotileDialogOpen}
        setDeleteTarget={setDeleteTarget}
        setManageTilesetsOpen={setManageTilesetsOpen}
        setManageTilesetsSelectedGroupId={setManageTilesetsSelectedGroupId}
        setNewGroupName={setNewGroupName}
      />
    </div>
  );
}
