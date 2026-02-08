import { useState } from "react";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditorStore } from "@/hooks/use-editor-store";
import { generateLayerId } from "@/lib/ids";
import type { LayerId, TileLayer } from "@/types";
import { cn } from "@/lib/utils";

export function LayersPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState("New Layer");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: LayerId;
    name: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<LayerId | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (!project) return null;

  const activeMap = project.maps.find((m) => m.id === state.activeMapId);
  if (!activeMap) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-1 border-b border-border bg-card shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Layers
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          No map selected
        </div>
      </div>
    );
  }

  // Get layers in display order (top to bottom = reversed layerOrder)
  const orderedLayers = [...activeMap.layerOrder]
    .reverse()
    .map((lid) => project.layers.find((l) => l.id === lid))
    .filter((l): l is TileLayer => l !== undefined);

  function handleAddLayer() {
    setAddLayerOpen(true);
    setNewLayerName(`Layer ${activeMap!.layerOrder.length + 1}`);
  }

  function handleCreateLayer() {
    const name = newLayerName.trim() || "New Layer";
    const layerId = generateLayerId();

    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;

      const layer: TileLayer = {
        id: layerId,
        mapId: map.id,
        name,
        visible: true,
        locked: false,
        tiles: {},
      };
      draft.project.layers.push(layer);
      map.layerOrder.push(layerId);
      draft.activeLayerId = layerId;
    });

    setAddLayerOpen(false);
  }

  function handleDeleteLayer() {
    if (!deleteTarget) return;
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      map.layerOrder = map.layerOrder.filter((id) => id !== deleteTarget.id);
      draft.project.layers = draft.project.layers.filter(
        (l) => l.id !== deleteTarget.id,
      );
      if (draft.activeLayerId === deleteTarget.id) {
        draft.activeLayerId = map.layerOrder[map.layerOrder.length - 1] ?? null;
      }
    });
    setDeleteTarget(null);
  }

  function handleToggleVisibility(layerId: LayerId) {
    setState((draft) => {
      const layer = draft.project?.layers.find((l) => l.id === layerId);
      if (layer) layer.visible = !layer.visible;
    });
  }

  function handleToggleLock(layerId: LayerId) {
    setState((draft) => {
      const layer = draft.project?.layers.find((l) => l.id === layerId);
      if (layer) layer.locked = !layer.locked;
    });
  }

  function handleMoveLayer(layerId: LayerId, direction: "up" | "down") {
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      const idx = map.layerOrder.indexOf(layerId);
      if (idx === -1) return;

      // "up" in visual = higher index in layerOrder (closer to top of render)
      const targetIdx = direction === "up" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= map.layerOrder.length) return;

      const temp = map.layerOrder[idx];
      map.layerOrder[idx] = map.layerOrder[targetIdx];
      map.layerOrder[targetIdx] = temp;
    });
  }

  function handleSelectLayer(layerId: LayerId) {
    setState((draft) => {
      draft.activeLayerId = layerId;
    });
  }

  function handleDoubleClick(layer: TileLayer) {
    setRenamingId(layer.id);
    setRenameValue(layer.name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) {
      setState((draft) => {
        const layer = draft.project?.layers.find((l) => l.id === renamingId);
        if (layer) layer.name = name;
      });
    }
    setRenamingId(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Layers
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleAddLayer}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Layer</TooltipContent>
        </Tooltip>
      </div>

      {/* Layer list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1 space-y-0.5">
          {orderedLayers.map((layer) => {
            const isActive = layer.id === state.activeLayerId;
            return (
              <div
                key={layer.id}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-1 rounded text-xs group cursor-pointer",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-secondary",
                )}
                onClick={() => handleSelectLayer(layer.id)}
              >
                {/* Visibility */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleVisibility(layer.id);
                      }}
                    >
                      {layer.visible ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {layer.visible ? "Hide" : "Show"}
                  </TooltipContent>
                </Tooltip>

                {/* Lock */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLock(layer.id);
                      }}
                    >
                      {layer.locked ? (
                        <Lock className="h-3 w-3 text-primary" />
                      ) : (
                        <Unlock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {layer.locked ? "Unlock" : "Lock"}
                  </TooltipContent>
                </Tooltip>

                {/* Name */}
                {renamingId === layer.id ? (
                  <input
                    className="flex-1 min-w-0 h-5 px-1 text-xs bg-background border border-primary rounded"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 truncate"
                    onDoubleClick={() => handleDoubleClick(layer)}
                  >
                    {layer.name}
                  </span>
                )}

                {/* Move/Delete buttons */}
                <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveLayer(layer.id, "up");
                        }}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move Up</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveLayer(layer.id, "down");
                        }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move Down</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: layer.id, name: layer.name });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete Layer</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Add layer dialog */}
      <Dialog open={addLayerOpen} onOpenChange={setAddLayerOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>New Layer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateLayer()}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Type: Tile Layer
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddLayerOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateLayer}>
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
            <AlertDialogTitle>Delete layer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all its
              tile data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLayer}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
