import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type DragEvent,
  useSyncExternalStore,
} from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TilesetCanvas } from "./TilesetCanvas";
import { TilesetDeleteDialog } from "./TilesetDeleteDialog";
import { TilesetImportChoiceDialog } from "./TilesetImportChoiceDialog";
import { TilesetPlacementControls } from "./TilesetPlacementControls";
import { TilesetToolbar } from "./TilesetToolbar";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import { AutotileDialog } from "@/features/map-editor/dialogs/AutotileDialog";
import { AnimationDialog } from "@/features/map-editor/dialogs/AnimationDialog";
import { AnimationsStrip } from "@/features/map-editor/components/animations/AnimationsStrip";
import { evictTileset } from "@/features/map-editor/components/MapCanvas/texture-cache";
import { getPaintableAutotileTerrainById } from "@/features/map-editor/lib/autotile";
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
import { NewTilesetGroupDialog } from "@/components/dialogs/NewTilesetGroupDialog";
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
  type EditorState,
  type TilesetGroupId,
  type TilesetId,
  type Tileset,
  type TilesetGroup,
  type TilesetAnimation,
} from "@/types";
import { QuickExportButtonGroup } from "@/features/import-export/components/QuickExportButtonGroup";
import type { TileRegion } from "@/features/map-editor/types/editor-ui";
import type {
  TilesetDeleteTarget,
  TilesetPanelProps,
} from "@/features/map-editor/types/tileset-panel";
import type {
  TilesetImageImportPosition,
  TilesetPlacementPreview,
} from "@/features/map-editor/types/tileset-import";

function getAdjacentItemId<T extends { id: string }>(
  items: T[],
  targetId: string,
): string | null {
  const index = items.findIndex((item) => item.id === targetId);
  if (index === -1) return null;
  return items[index + 1]?.id ?? items[index - 1]?.id ?? null;
}

function syncActiveTilesetState(
  draft: EditorState,
  tilesetId: TilesetId | null,
): void {
  draft.activeTilesetId = tilesetId;
  const activeTileset = draft.project?.tilesets.find(
    (tileset) => tileset.id === tilesetId,
  );
  draft.tileSize = getTilesetTileSize(
    activeTileset,
    draft.project?.tileSize ?? draft.tileSize,
  );
  draft.selectedTile = null;
  draft.selectedAutotileTerrain = null;
  draft.selectedAnimation = null;
}

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
  const groupTilesets =
    project?.tilesets.filter((t) => t.groupId === state.activeTilesetGroupId) ??
    [];
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

  async function handleAddTileset() {
    fileInputRef.current?.click();
  }

  async function createTilesetFromPendingImport() {
    if (!pendingImport) return;
    if (!project) return;

    const targetGroupId = activeGroup?.id ?? project.tilesetGroups[0]?.id;
    if (!targetGroupId) {
      setImageImportError("Create a tileset group first.");
      return;
    }

    setImageImportCommitting(true);
    setImageImportError(null);

    try {
      const assetId = generateAssetId();
      await saveAsset(assetId, pendingImport.buffer, pendingImport.mimeType);

      const tilesetId = generateTilesetId();
      const name = pendingImport.name;

      setState((draft) => {
        if (!draft.project) return;
        const tileset: Tileset = {
          id: tilesetId,
          name,
          groupId: targetGroupId,
          tileSize: activeTileSize,
          assetId,
          imageWidth: pendingImport.width,
          imageHeight: pendingImport.height,
          createdAt: Date.now(),
        };
        draft.project.tilesets.push(tileset);
        draft.activeTilesetGroupId = targetGroupId;
        syncActiveTilesetState(draft, tilesetId);
      });
      resetImageImport();
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
      resetImageImport();
    } catch (caughtError) {
      console.error("[Tileset Image Merge] Failed:", caughtError);
      setImageImportError("Failed to add the image to the active tileset.");
    } finally {
      setImageImportCommitting(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (isTilesetImageFile(file)) {
        await queueImageFile(file);
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
      await queueImageFile(file);
    } else {
      await onImportTilesetFromFile(file);
    }
  }

  function handleGroupChange(value: string) {
    if (value === "__add__") {
      setAddGroupOpen(true);
      setNewGroupName("");
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
      draft.activeTilesetGroupId = id;
      syncActiveTilesetState(draft, null);
    });
    setAddGroupOpen(false);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "tileset") {
      // Find asset to clean up
      const tileset = project?.tilesets.find((t) => t.id === deleteTarget.id);
      const tilesetsInGroup = tileset
        ? project?.tilesets.filter((t) => t.groupId === tileset.groupId)
        : [];
      const nextTilesetId = getAdjacentItemId(
        tilesetsInGroup ?? [],
        deleteTarget.id,
      );
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
        draft.project.tilesets = draft.project.tilesets.filter(
          (t) => t.groupId !== deleteTarget.id,
        );
        if (draft.activeTilesetGroupId === deleteTarget.id) {
          draft.activeTilesetGroupId =
            draft.project.tilesetGroups[0]?.id ?? null;
          syncActiveTilesetState(draft, null);
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

  function requestDeleteTileset(tileset: Tileset) {
    setDeleteTarget({
      type: "tileset",
      id: tileset.id,
      name: tileset.name,
    });
  }

  function commitRename() {
    if (!renamingTabId) return;
    const name = renameValue.trim();
    if (name) {
      setState((draft) => {
        if (!draft.project) return;
        const t = draft.project.tilesets.find((t) => t.id === renamingTabId);
        if (t) t.name = name;
      });
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

      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0">
        <Select
          value={state.activeTilesetGroupId ?? ""}
          onValueChange={handleGroupChange}
        >
          <SelectTrigger className="h-6 w-25 text-xs shrink-0">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {project.tilesetGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
            <SelectItem value="__add__">+ Add Group</SelectItem>
          </SelectContent>
        </Select>

        {activeGroup && project.tilesetGroups.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-destructive"
                aria-label={`Delete group ${activeGroup.name}`}
                onMouseDown={() =>
                  setDeleteTarget({
                    type: "group",
                    id: activeGroup.id,
                    name: activeGroup.name,
                  })
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Group</TooltipContent>
          </Tooltip>
        )}

        {groupTilesets.length > 0 && (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <Tabs
              value={state.activeTilesetId ?? ""}
              onValueChange={(v) =>
                setState((draft) => {
                  syncActiveTilesetState(draft, v as TilesetId);
                })
              }
            >
              <TabsList
                variant="editor"
                className="h-8 rounded-none bg-transparent p-0"
                scrollable
              >
                {groupTilesets.map((t) => (
                  <div
                    key={t.id}
                    data-state={
                      state.activeTilesetId === t.id ? "active" : "inactive"
                    }
                    className="group/tab -mb-px flex h-7 min-w-0 items-center rounded-t-sm border border-transparent border-b-border/70 bg-muted/20 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                  >
                    {renamingTabId === t.id ? (
                      <input
                        ref={renameInputRef}
                        id={`rename-tileset-tab-${t.id}`}
                        name={`rename-tileset-tab-${t.id}`}
                        aria-label={`Rename tileset ${t.name}`}
                        className="mx-1 h-6 w-28 rounded border border-primary bg-background px-1 text-xs"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingTabId(null);
                        }}
                      />
                    ) : (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <TabsTrigger
                                    value={t.id}
                                    className="h-7 min-w-0 rounded-none px-2 text-[11px]"
                                    onDoubleClick={() =>
                                      handleTabDoubleClick(t)
                                    }
                                  >
                                    <span className="max-w-40 truncate">
                                      {t.name}
                                    </span>
                                  </TabsTrigger>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                Double Click to Rename
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onMouseDown={() => handleTabDoubleClick(t)}
                          >
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onMouseDown={() => handleDuplicateTileset(t)}
                          >
                            Duplicate
                          </ContextMenuItem>
                          <ContextMenuItem
                            onMouseDown={() => requestDeleteTileset(t)}
                          >
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Close tileset ${t.name}`}
                          className="mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-sm text-muted-foreground/80 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/tab:opacity-100 group-data-[state=active]/tab:opacity-100 group-hover/tab:pointer-events-auto group-data-[state=active]/tab:pointer-events-auto pointer-events-none"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            requestDeleteTileset(t);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Close Tileset</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {!groupTilesets.length && <div className="flex-1" />}

        <Button
          variant="default"
          size="sm"
          className="h-6 px-2 text-[10px] shrink-0"
          onClick={handleAddTileset}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Tileset
        </Button>
      </div>

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
        {pendingImport && imageImportMode === "choice" ? (
          <TilesetImportChoiceDialog
            pendingImport={pendingImport}
            activeTileset={activeTileset ?? null}
            isBusy={isImageImportBusy}
            error={imageImportError}
            onCreateNew={createTilesetFromPendingImport}
            onAddToExisting={beginPendingTilesetPlacement}
            onCancel={resetImageImport}
          />
        ) : null}
        {pendingImport &&
        imageImportMode === "placement" &&
        activeTileset &&
        placementCanvasSize ? (
          <TilesetPlacementControls
            pendingImport={pendingImport}
            position={placementPosition}
            tileSize={activeTileSize}
            canvasSize={placementCanvasSize}
            isBusy={isImageImportBusy}
            error={imageImportError}
            onPositionChange={handlePlacementPositionChange}
            onPlace={commitPendingTilesetPlacement}
            onCancel={resetImageImport}
          />
        ) : null}
        <div className="absolute bottom-3 right-3 z-20">
          <QuickExportButtonGroup
            buttonId="tileset-quick-export-button"
            buttonName="tileset-quick-export-button"
            dropdownButtonId="tileset-quick-export-dropdown"
            dropdownButtonName="tileset-quick-export-dropdown"
            state={quickExportControl}
          />
        </div>
        {isDropTargetActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary bg-background/80">
            <span className="rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
              Drop a file to choose tileset import options
            </span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        id="tileset-file-input"
        name="tileset-file-input"
        type="file"
        accept="image/*,.2dt,.tsx,.tsj,.xml,.json,.lua,.tres,.tilesource,.prefab"
        className="hidden"
        onChange={(e) => {
          void handleFileSelected(e);
        }}
      />

      <NewTilesetGroupDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        name={newGroupName}
        onNameChange={setNewGroupName}
        onCreate={handleCreateGroup}
      />

      {activeTileset && (
        <AutotileDialog
          key={`${activeTileset.id}-${autotileDialogOpen ? "open" : "closed"}`}
          open={autotileDialogOpen}
          onOpenChange={setAutotileDialogOpen}
          onSave={handleSaveAutotile}
          tileset={activeTileset}
        />
      )}

      {activeTileset && animationDialogOpen ? (
        <AnimationDialog
          key={`${activeTileset.id}-${editingAnimation?.id ?? "new"}-open`}
          animation={editingAnimation}
          open={animationDialogOpen}
          onOpenChange={setAnimationDialogOpen}
          onSave={handleSaveAnimation}
          tileset={activeTileset}
        />
      ) : null}

      <TilesetDeleteDialog
        deleteTarget={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
