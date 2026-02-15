import { useState, memo, useCallback } from "react";
import {
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  GripVertical,
  TextCursorInput,
  Square,
  MapPin,
  Circle,
  Pentagon,
  Settings2,
  Copy,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ObjectPropertiesDialog } from "@/components/dialogs/ObjectPropertiesDialog";
import { useEditorStore } from "@/hooks/use-editor-store";
import { generateObjectId } from "@/lib/ids";
import type { ObjectId, ObjectType, MapObject } from "@/types";
import { cn } from "@/lib/utils";

const OBJECT_TYPE_ICONS: Record<ObjectType, typeof Square> = {
  rectangle: Square,
  point: MapPin,
  ellipse: Circle,
  polygon: Pentagon,
};

export function ObjectsPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [propsObjectId, setPropsObjectId] = useState<ObjectId | null>(null);

  // Drag & drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: string;
    position: "above" | "below";
  } | null>(null);

  if (!project) return null;

  // Find the active object layer
  const objectLayers = project.objectLayers ?? [];
  const activeObjectLayer = objectLayers.find(
    (l) => l.id === state.activeLayerId,
  );

  if (!activeObjectLayer) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-1 border-b border-border bg-card shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Objects
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          Select an object layer
        </div>
      </div>
    );
  }

  const objects = (project.objects ?? []).filter(
    (o) => o.layerId === activeObjectLayer.id,
  );
  // Build ordered list based on objectOrder
  const orderedObjects = activeObjectLayer.objectOrder
    .map((oid) => objects.find((o) => o.id === oid))
    .filter((o): o is MapObject => o !== undefined)
    .reverse(); // display top-to-bottom = reverse of render order

  const propsObject = propsObjectId
    ? (project.objects ?? []).find((o) => o.id === propsObjectId)
    : null;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleAddObject(type: ObjectType) {
    setState((draft) => {
      draft.pendingObjectType = type;
      draft.currentTool = "select";
    });
  }

  function handleSelectObject(objectId: ObjectId) {
    setState((draft) => {
      draft.activeObjectId = objectId;
    });
  }

  function handleDoubleClick(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) {
      setState((draft) => {
        const obj = (draft.project?.objects ?? []).find(
          (o) => o.id === renamingId,
        );
        if (obj) obj.name = name;
      });
    }
    setRenamingId(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    setState((draft) => {
      if (!draft.project) return;
      // Remove object from objects array
      draft.project.objects = (draft.project.objects ?? []).filter(
        (o) => o.id !== deleteTarget.id,
      );
      // Remove from object layer's objectOrder
      const layer = (draft.project.objectLayers ?? []).find(
        (l) => l.id === state.activeLayerId,
      );
      if (layer) {
        layer.objectOrder = layer.objectOrder.filter(
          (id) => id !== deleteTarget.id,
        );
      }
      if (draft.activeObjectId === deleteTarget.id) {
        draft.activeObjectId = null;
      }
    });
    setDeleteTarget(null);
  }

  function handleToggleVisibility(objectId: string) {
    setState((draft) => {
      const obj = (draft.project?.objects ?? []).find((o) => o.id === objectId);
      if (obj) obj.visible = !obj.visible;
    });
  }

  function handleToggleLock(objectId: string) {
    setState((draft) => {
      const obj = (draft.project?.objects ?? []).find((o) => o.id === objectId);
      if (obj) obj.locked = !obj.locked;
    });
  }

  function handleMoveItem(id: string, direction: "up" | "down") {
    setState((draft) => {
      const layer = (draft.project?.objectLayers ?? []).find(
        (l) => l.id === state.activeLayerId,
      );
      if (!layer) return;
      const idx = (layer.objectOrder as string[]).indexOf(id);
      if (idx === -1) return;
      // "up" in visual = higher index in objectOrder
      const targetIdx = direction === "up" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= layer.objectOrder.length) return;
      const temp = layer.objectOrder[idx];
      layer.objectOrder[idx] = layer.objectOrder[targetIdx];
      layer.objectOrder[targetIdx] = temp;
    });
  }

  function handleDuplicateObject(objectId: string) {
    if (!project) return;
    const src = (project.objects ?? []).find((o) => o.id === objectId);
    if (!src) return;
    const newId = generateObjectId();
    setState((draft) => {
      if (!draft.project) return;
      if (!draft.project.objects) draft.project.objects = [];
      const copy: MapObject = {
        ...src,
        id: newId,
        name: `${src.name} copy`,
        x: src.x + 16,
        y: src.y + 16,
        points: src.points.map((p) => ({ ...p })),
        properties: { ...src.properties },
      };
      draft.project.objects.push(copy);
      const layer = (draft.project.objectLayers ?? []).find(
        (l) => l.id === state.activeLayerId,
      );
      if (layer) {
        const insertIdx = (layer.objectOrder as string[]).indexOf(objectId);
        if (insertIdx !== -1) {
          layer.objectOrder.splice(insertIdx + 1, 0, newId);
        } else {
          layer.objectOrder.push(newId);
        }
      }
      draft.activeObjectId = newId;
    });
  }

  // Drag & drop handlers
  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropIndicator(null);
  }

  function handleDragOverRow(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === targetId) {
      setDropIndicator(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    const position: "above" | "below" = ratio < 0.5 ? "above" : "below";
    setDropIndicator({ targetId, position });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || !dropIndicator) {
      handleDragEnd();
      return;
    }
    const { targetId, position } = dropIndicator;
    setState((draft) => {
      const layer = (draft.project?.objectLayers ?? []).find(
        (l) => l.id === state.activeLayerId,
      );
      if (!layer) return;
      // Remove dragged item
      const dragIdx = (layer.objectOrder as string[]).indexOf(dragId);
      if (dragIdx === -1) return;
      layer.objectOrder.splice(dragIdx, 1);
      // Insert at target position
      const targetIdx = (layer.objectOrder as string[]).indexOf(targetId);
      if (targetIdx === -1) return;
      // Display is reversed so "above" in display = higher index in data
      const insertIdx = position === "above" ? targetIdx + 1 : targetIdx;
      layer.objectOrder.splice(insertIdx, 0, dragId as ObjectId);
    });
    handleDragEnd();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Objects
        </span>
        <div className="flex items-center gap-0.5">
          {(
            [
              ["rectangle", "Rectangle", Square],
              ["point", "Point", MapPin],
              ["ellipse", "Ellipse", Circle],
              ["polygon", "Polygon", Pentagon],
            ] as const
          ).map(([type, label, Icon]) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button
                  variant={
                    state.pendingObjectType === type ? "default" : "ghost"
                  }
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={() => handleAddObject(type as ObjectType)}
                >
                  <Icon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add {label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Object list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1 space-y-0.5">
          {orderedObjects.map((obj) => (
            <ObjectRow
              key={obj.id}
              object={obj}
              isActive={obj.id === state.activeObjectId}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onDoubleClick={handleDoubleClick}
              onCommitRename={commitRename}
              onCancelRename={() => setRenamingId(null)}
              onSelect={handleSelectObject}
              onToggleVisibility={handleToggleVisibility}
              onToggleLock={handleToggleLock}
              onMove={handleMoveItem}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
              onDuplicate={handleDuplicateObject}
              onEditProperties={(id) => setPropsObjectId(id as ObjectId)}
              isDragging={dragId === obj.id}
              dropIndicator={
                dropIndicator?.targetId === obj.id
                  ? dropIndicator.position
                  : null
              }
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOverRow}
              onDrop={handleDrop}
            />
          ))}
          {orderedObjects.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-4">
              Click a shape button above,
              <br />
              then click-drag on the map
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete object?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Object properties dialog */}
      {propsObject && (
        <ObjectPropertiesDialog
          open={!!propsObjectId}
          onOpenChange={(o) => !o && setPropsObjectId(null)}
          object={propsObject}
          onSave={(updatedProps, updatedName) => {
            setState((draft) => {
              const obj = (draft.project?.objects ?? []).find(
                (o) => o.id === propsObjectId,
              );
              if (obj) {
                obj.properties = updatedProps as typeof obj.properties;
                if (updatedName) obj.name = updatedName;
              }
            });
            setPropsObjectId(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ObjectRow component
// ---------------------------------------------------------------------------

interface ObjectRowProps {
  object: MapObject;
  isActive: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: (id: ObjectId) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onEditProperties: (id: string) => void;
  isDragging: boolean;
  dropIndicator: "above" | "below" | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, targetId: string) => void;
  onDrop: (e: React.DragEvent) => void;
}

const ObjectRow = memo(function ObjectRow({
  object,
  isActive,
  renamingId,
  renameValue,
  onRenameValueChange,
  onDoubleClick,
  onCommitRename,
  onCancelRename,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onMove,
  onDelete,
  onDuplicate,
  onEditProperties,
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ObjectRowProps) {
  const isRenaming = renamingId === object.id;
  const Icon = OBJECT_TYPE_ICONS[object.type] ?? Square;

  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      requestAnimationFrame(() => {
        node.focus();
        node.select();
      });
    }
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "layer-item relative flex items-center gap-1 px-1.5 py-1 rounded text-xs group/item cursor-pointer",
            isActive
              ? "bg-accent text-accent-foreground"
              : "hover:bg-secondary",
            isDragging && "opacity-40",
          )}
          onMouseDown={() => onSelect(object.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", object.id);
            onDragStart(object.id);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, object.id)}
          onDrop={onDrop}
        >
          {/* Drop indicator lines */}
          {dropIndicator === "above" && (
            <div className="absolute left-1 right-1 top-0 -translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}
          {dropIndicator === "below" && (
            <div className="absolute left-1 right-1 bottom-0 translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}

          {/* Drag handle */}
          <span
            className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover/item:opacity-60 hover:opacity-100!"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </span>

          {/* Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(object.id);
                }}
              >
                {object.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{object.visible ? "Hide" : "Show"}</TooltipContent>
          </Tooltip>

          {/* Lock */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleLock(object.id);
                }}
              >
                {object.locked ? (
                  <Lock className="h-3 w-3 text-primary" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{object.locked ? "Unlock" : "Lock"}</TooltipContent>
          </Tooltip>

          {/* Type icon */}
          <span className="shrink-0">
            <Icon className="h-3 w-3 text-muted-foreground" />
          </span>

          {/* Name */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="flex-1 min-w-0 h-5 px-1 text-xs bg-background border border-primary rounded"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 truncate"
              onDoubleClick={() => {
                onEditProperties(object.id);
              }}
            >
              {object.name}
            </span>
          )}

          {/* Move/Delete buttons */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0 px-0.5 rounded-r bg-secondary opacity-0 group-hover/item:opacity-100 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(object.id, "up");
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(object.id, "down");
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
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onDelete(object.id, object.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Object</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onMouseDown={() => onToggleVisibility(object.id)}>
          {object.visible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" /> Hide
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" /> Show
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onToggleLock(object.id)}>
          {object.locked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Unlock
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Lock
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onDoubleClick(object.id, object.name)}
        >
          <TextCursorInput className="h-4 w-4 mr-2" /> Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onMouseDown={() => onEditProperties(object.id)}>
          <Settings2 className="h-4 w-4 mr-2" /> Edit Properties
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(object.id)}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onMouseDown={() => onMove(object.id, "up")}>
          <ChevronUp className="h-4 w-4 mr-2" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onMove(object.id, "down")}>
          <ChevronDown className="h-4 w-4 mr-2" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(object.id, object.name)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
