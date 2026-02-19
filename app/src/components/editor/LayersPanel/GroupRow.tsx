import { memo, useCallback } from "react";
import {
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Folder,
  FolderOpen,
  GripVertical,
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
import type { GroupRowProps } from "@/types";
import { cn } from "@/lib/utils";

export const GroupRow = memo(function GroupRow({
  group,
  depth,
  parentGroupId,
  renamingId,
  renameValue,
  onRenameValueChange,
  onDoubleClick,
  onCommitRename,
  onCancelRename,
  onToggleExpand,
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
}: GroupRowProps) {
  const isRenaming = renamingId === group.id;

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
            "layer-item relative flex items-center gap-1 px-1.5 py-1 rounded text-xs group/item cursor-pointer bg-muted/30 hover:bg-secondary",
            isDragging && "opacity-40",
            dropIndicator === "inside" &&
              "ring-2 ring-primary ring-inset bg-primary/10",
          )}
          style={{ paddingLeft: `${6 + depth * 16}px` }}
          onMouseDown={() => onToggleExpand(group.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", group.id);
            onDragStart(group.id, true);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, group.id, true)}
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
                  onToggleVisibility(group.id, true);
                }}
              >
                {group.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.visible ? "Hide Group" : "Show Group"}
            </TooltipContent>
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
                  onToggleLock(group.id, true);
                }}
              >
                {group.locked ? (
                  <Lock className="h-3 w-3 text-primary" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.locked ? "Unlock Group" : "Lock Group"}
            </TooltipContent>
          </Tooltip>

          {/* Folder icon */}
          <span className="shrink-0">
            {group.expanded ? (
              <FolderOpen className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Folder className="h-3 w-3 text-muted-foreground" />
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
              className="flex-1 min-w-0 truncate font-medium"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(group.id, group.name);
              }}
            >
              {group.name}
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
                    onMove(group.id, "up", parentGroupId);
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
                    onMove(group.id, "down", parentGroupId);
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
                    onDelete(group.id, group.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Group</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onMouseDown={() => onToggleVisibility(group.id, true)}>
          {group.visible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" /> Hide Group
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" /> Show Group
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onToggleLock(group.id, true)}>
          {group.locked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Unlock Group
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Lock Group
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onDoubleClick(group.id, group.name)}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(group.id)}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onMouseDown={() => onMove(group.id, "up", parentGroupId)}
        >
          <ChevronUp className="h-4 w-4 mr-2" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(group.id, "down", parentGroupId)}
        >
          <ChevronDown className="h-4 w-4 mr-2" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(group.id, group.name)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Group
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
