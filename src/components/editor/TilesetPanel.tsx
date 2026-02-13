import { useRef, useState, useCallback, useEffect } from "react";
import { Plus, ZoomIn, ZoomOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { useEditorStore } from "@/hooks/use-editor-store";
import { useCanvasNavigation } from "@/hooks/use-canvas-navigation";
import { saveAsset, getAsset, getAssetUrl, deleteAsset } from "@/lib/db";
import {
  generateTilesetId,
  generateTilesetGroupId,
  generateAssetId,
} from "@/lib/ids";
import {
  TILE_SIZES,
  type TileSize,
  type TilesetGroupId,
  type TilesetId,
  type Tileset,
  type TilesetGroup,
} from "@/types";

export function TilesetPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;

  const [deleteTarget, setDeleteTarget] = useState<{
    type: "tileset" | "group";
    id: string;
    name: string;
  } | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingTabId, setRenamingTabId] = useState<TilesetId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas refs for tileset display
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTilesetImageUrl] = useState<string | null>(null);
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(
    null,
  );

  // Selection state
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Ctrl+Wheel zoom and middle-mouse pan

  const handleSetTilesetZoom = useCallback(
    (newZoom: number) => {
      setState((draft) => {
        draft.tilesetZoom = newZoom;
      });
    },
    [setState],
  );

  useCanvasNavigation(containerRef, state.tilesetZoom, handleSetTilesetZoom);

  if (!project) return null;

  const activeGroup = project.tilesetGroups.find(
    (g) => g.id === state.activeTilesetGroupId,
  );
  const groupTilesets = project.tilesets.filter(
    (t) => t.groupId === state.activeTilesetGroupId,
  );
  const activeTileset = project.tilesets.find(
    (t) => t.id === state.activeTilesetId,
  );

  // Load tileset image when active tileset changes
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!activeTileset) {
      setTilesetImageUrl(null);
      setTilesetImage(null);
      return;
    }
    let revoke: string | null = null;
    getAssetUrl(activeTileset.assetId).then((url) => {
      if (url) {
        revoke = url;
        setTilesetImageUrl(url);
        const img = new Image();
        img.onload = () => setTilesetImage(img);
        img.src = url;
      }
    });
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [activeTileset]);

  // Draw tileset on canvas with grid
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tilesetImage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const zoom = state.tilesetZoom;
    const w = tilesetImage.width * zoom;
    const h = tilesetImage.height * zoom;
    canvas.width = w;
    canvas.height = h;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tilesetImage, 0, 0, w, h);

    // Draw grid
    const tileSize = state.tileSize * zoom;
    ctx.strokeStyle = "rgba(255, 165, 0, 0.3)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // Draw hover highlight
    if (hoverCell) {
      ctx.fillStyle = "rgba(255, 165, 0, 0.15)";
      ctx.fillRect(
        hoverCell.x * tileSize,
        hoverCell.y * tileSize,
        tileSize,
        tileSize,
      );
    }

    // Draw selected tile highlight
    if (
      state.selectedTile &&
      activeTileset &&
      state.selectedTile.tilesetId === activeTileset.id
    ) {
      ctx.strokeStyle = "rgba(255, 165, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        state.selectedTile.sx * zoom + 1,
        state.selectedTile.sy * zoom + 1,
        state.selectedTile.sw * zoom - 2,
        state.selectedTile.sh * zoom - 2,
      );
    }
  }, [
    tilesetImage,
    state.tilesetZoom,
    state.tileSize,
    hoverCell,
    state.selectedTile,
    activeTileset,
  ]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!activeTileset || !tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const zoom = state.tilesetZoom;
      const tileSize = state.tileSize;
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));

      setState((draft) => {
        draft.selectedTile = {
          tilesetId: activeTileset.id,
          sx: x * tileSize,
          sy: y * tileSize,
          sw: tileSize,
          sh: tileSize,
        };
      });
    },
    [activeTileset, tilesetImage, state.tilesetZoom, state.tileSize, setState],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tilesetImage) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const zoom = state.tilesetZoom;
      const tileSize = state.tileSize;
      const x = Math.floor((e.clientX - rect.left) / (tileSize * zoom));
      const y = Math.floor((e.clientY - rect.top) / (tileSize * zoom));
      setHoverCell({ x, y });
    },
    [tilesetImage, state.tilesetZoom, state.tileSize],
  );

  async function handleAddTileset() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeGroup) return;

    const buffer = await file.arrayBuffer();
    const assetId = generateAssetId();
    await saveAsset(assetId, buffer, file.type);

    // Get image dimensions
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const tilesetId = generateTilesetId();
    const name = file.name.replace(/\.[^/.]+$/, "");

    setState((draft) => {
      if (!draft.project) return;
      const tileset: Tileset = {
        id: tilesetId,
        name,
        groupId: activeGroup.id,
        assetId,
        imageWidth: img.width,
        imageHeight: img.height,
        createdAt: Date.now(),
      };
      draft.project.tilesets.push(tileset);
      draft.activeTilesetId = tilesetId;
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
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
        draft.activeTilesetId = firstInGroup?.id ?? null;
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
      draft.activeTilesetId = null;
    });
    setAddGroupOpen(false);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "tileset") {
      // Find asset to clean up
      const tileset = project?.tilesets.find((t) => t.id === deleteTarget.id);
      if (tileset) {
        void deleteAsset(tileset.assetId);
      }
      setState((draft) => {
        if (!draft.project) return;
        draft.project.tilesets = draft.project.tilesets.filter(
          (t) => t.id !== deleteTarget.id,
        );
        if (draft.activeTilesetId === deleteTarget.id) {
          draft.activeTilesetId = null;
          draft.selectedTile = null;
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
          draft.activeTilesetId = null;
          draft.selectedTile = null;
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
        assetId: newAssetId,
        imageWidth: source.imageWidth,
        imageHeight: source.imageHeight,
        createdAt: Date.now(),
      };
      draft.project.tilesets.push(tileset);
      draft.activeTilesetId = newTilesetId;
    });
  }

  function handleTileSizeChange(value: string) {
    setState((draft) => {
      draft.tileSize = Number(value) as TileSize;
      draft.selectedTile = null;
    });
  }

  function handleZoom(direction: 1 | -1) {
    setState((draft) => {
      const next = draft.tilesetZoom + direction * 0.5;
      draft.tilesetZoom = Math.max(0.5, Math.min(4, next));
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tileset toolbar */}
      <div className="flex items-center gap-1 px-1 py-0.5 border-b border-border bg-card shrink-0 flex-wrap">
        {/* Tile size selector */}
        <Select
          value={String(state.tileSize)}
          onValueChange={handleTileSizeChange}
        >
          <SelectTrigger className="h-6 w-18 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TILE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleZoom(-1)}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground w-8 text-center">
            {Math.round(state.tilesetZoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleZoom(1)}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Group selector + Tileset tabs + Add */}
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
                onClick={() =>
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
                  draft.activeTilesetId = v as TilesetId;
                })
              }
            >
              <TabsList
                className="h-7 bg-transparent rounded-none p-0"
                scrollable
              >
                {groupTilesets.map((t) => (
                  <div key={t.id} className="flex items-center group">
                    {renamingTabId === t.id ? (
                      <input
                        ref={renameInputRef}
                        className="h-6 w-24 px-1 text-xs bg-background border border-primary rounded"
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
                                    className="h-6 px-2 text-xs rounded-none"
                                    onDoubleClick={() =>
                                      handleTabDoubleClick(t)
                                    }
                                  >
                                    {t.name}
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
                            onClick={() => handleTabDoubleClick(t)}
                          >
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleDuplicateTileset(t)}
                          >
                            Duplicate
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              type: "tileset",
                              id: t.id,
                              name: t.name,
                            })
                          }
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete Tileset</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {!groupTilesets.length && <div className="flex-1" />}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleAddTileset}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Tileset</TooltipContent>
        </Tooltip>
      </div>

      {/* Tileset canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto min-h-0"
        onMouseLeave={() => setHoverCell(null)}
      >
        {activeTileset && tilesetImage ? (
          <canvas
            ref={canvasRef}
            className="cursor-crosshair"
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            {groupTilesets.length === 0
              ? "Click + to add a tileset"
              : "Select a tileset tab"}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Add group dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>New Tileset Group</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddGroupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "group" ? "group" : "tileset"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}"
              {deleteTarget?.type === "group" && " and all tilesets in it"}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
