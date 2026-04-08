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
  const layerKind =
    layer.type === "image"
      ? "Image"
      : layer.type === "object"
        ? "Object"
        : "Tile";

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
            "layer-item group/item relative flex items-center gap-1 border-b border-border px-3 py-3 text-sm transition-colors",
            isActive
              ? "bg-secondary text-foreground"
              : "text-foreground hover:bg-accent",
            isDragging && "opacity-40",
          )}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
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
          {isActive && (
            <div className="pointer-events-none absolute left-0 top-2 bottom-2 w-0.5 bg-foreground" />
          )}

          {dropIndicator === "above" && (
            <div className="pointer-events-none absolute left-3 right-3 top-0 h-px bg-foreground" />
          )}
          {dropIndicator === "below" && (
            <div className="pointer-events-none absolute left-3 right-3 bottom-0 h-px bg-foreground" />
          )}

          <span
            className="shrink-0 cursor-grab text-text-disabled transition-opacity active:cursor-grabbing group-hover/item:text-text-secondary"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" />
          </span>

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
                  <Eye className="h-3 w-3 text-foreground" />
                ) : (
                  <EyeOff className="h-3 w-3 text-text-disabled" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.visible ? "Hide" : "Show"}</TooltipContent>
          </Tooltip>

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
                  <Lock className="h-3 w-3 text-foreground" />
                ) : (
                  <Unlock className="h-3 w-3 text-text-disabled" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.locked ? "Unlock" : "Lock"}</TooltipContent>
          </Tooltip>

          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary">
            {layer.type === "image" ? (
              <Image className="h-3 w-3" />
            ) : layer.type === "object" ? (
              <Shapes className="h-3 w-3" />
            ) : (
              <Grid3X3 className="h-3 w-3" />
            )}
          </span>

          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border-visible bg-background px-3 font-mono text-[12px] uppercase tracking-[0.08em] text-foreground outline-none focus:border-foreground"
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
            <div
              className="min-w-0 flex-1 basis-0 overflow-hidden"
              onDoubleClick={() => onDoubleClick(layer.id, layer.name)}
            >
              <div className="truncate font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                {layerKind}
              </div>
              <div className="mt-1 truncate text-[13px] leading-none text-foreground">
                {layer.name}
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-0 pr-0.5">
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
          <TextCursorInput className="mr-2 h-4 w-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(layer.id)}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onMouseDown={() => onMove(layer.id, "up", parentGroupId)}
        >
          <ChevronUp className="mr-2 h-4 w-4" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(layer.id, "down", parentGroupId)}
        >
          <ChevronDown className="mr-2 h-4 w-4" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(layer.id, layer.name)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete Layer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
