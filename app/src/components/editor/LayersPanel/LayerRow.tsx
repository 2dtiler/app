import { memo, useCallback } from "react";
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
  Grid3X3,
  Image,
  Shapes,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { LayerRowProps } from "@/types";
import { cn } from "@/lib/utils";

export const LayerRow = memo(function LayerRow({
  layer,
  depth,
  parentGroupId,
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
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: LayerRowProps) {
  const isRenaming = renamingId === layer.id;

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
          style={{ paddingLeft: `${6 + depth * 16}px` }}
          onMouseDown={() => onSelect(layer.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", layer.id);
            onDragStart(layer.id, false);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, layer.id, false)}
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
                  onToggleVisibility(layer.id, false);
                }}
              >
                {layer.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.visible ? "Hide" : "Show"}</TooltipContent>
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
                  onToggleLock(layer.id, false);
                }}
              >
                {layer.locked ? (
                  <Lock className="h-3 w-3 text-primary" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.locked ? "Unlock" : "Lock"}</TooltipContent>
          </Tooltip>

          {/* Layer type icon */}
          <span className="shrink-0">
            {layer.type === "image" ? (
              <Image className="h-3 w-3 text-muted-foreground" />
            ) : layer.type === "object" ? (
              <Shapes className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Grid3X3 className="h-3 w-3 text-muted-foreground" />
            )}
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
              onDoubleClick={() => onDoubleClick(layer.id, layer.name)}
            >
              {layer.name}
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
                    onMove(layer.id, "up", parentGroupId);
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
                    onMove(layer.id, "down", parentGroupId);
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
                    onDelete(layer.id, layer.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Layer</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onMouseDown={() => onToggleVisibility(layer.id, false)}
        >
          {layer.visible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" /> Hide Layer
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" /> Show Layer
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onToggleLock(layer.id, false)}>
          {layer.locked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Unlock Layer
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Lock Layer
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onDoubleClick(layer.id, layer.name)}
        >
          <TextCursorInput className="h-4 w-4 mr-2" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(layer.id)}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onMouseDown={() => onMove(layer.id, "up", parentGroupId)}
        >
          <ChevronUp className="h-4 w-4 mr-2" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(layer.id, "down", parentGroupId)}
        >
          <ChevronDown className="h-4 w-4 mr-2" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(layer.id, layer.name)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Layer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
