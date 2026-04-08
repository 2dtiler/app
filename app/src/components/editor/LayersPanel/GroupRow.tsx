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
  TextCursorInput,
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
            "layer-item group/item relative flex items-center gap-2 border-b border-border px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent",
            isDragging && "opacity-40",
            dropIndicator === "inside" && "bg-secondary",
          )}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
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
          {dropIndicator === "above" && (
            <div className="pointer-events-none absolute left-3 right-3 top-0 h-px bg-foreground" />
          )}
          {dropIndicator === "below" && (
            <div className="pointer-events-none absolute left-3 right-3 bottom-0 h-px bg-foreground" />
          )}
          {dropIndicator === "inside" && (
            <div className="pointer-events-none absolute inset-x-3 inset-y-1 rounded-[10px] border border-border-visible" />
          )}

          <span
            className="shrink-0 cursor-grab text-text-disabled transition-colors active:cursor-grabbing group-hover/item:text-text-secondary"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(group.id, true);
                }}
              >
                {group.visible ? (
                  <Eye className="h-3 w-3 text-foreground" />
                ) : (
                  <EyeOff className="h-3 w-3 text-text-disabled" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.visible ? "Hide Group" : "Show Group"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleLock(group.id, true);
                }}
              >
                {group.locked ? (
                  <Lock className="h-3 w-3 text-foreground" />
                ) : (
                  <Unlock className="h-3 w-3 text-text-disabled" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.locked ? "Unlock Group" : "Lock Group"}
            </TooltipContent>
          </Tooltip>

          <span className="shrink-0 text-text-secondary">
            {group.expanded ? (
              <FolderOpen className="h-3.5 w-3.5" />
            ) : (
              <Folder className="h-3.5 w-3.5" />
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
              className="min-w-0 flex-1"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(group.id, group.name);
              }}
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Group
              </div>
              <div className="mt-1 truncate text-[13px] leading-none text-foreground">
                {group.name}
              </div>
            </div>
          )}

          <div className="absolute top-0 right-0 bottom-0 z-20 flex items-center gap-1 bg-linear-to-l from-background via-background/96 to-transparent pl-6 pr-2 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
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
                  size="icon-xs"
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
                  variant="destructive"
                  size="icon-xs"
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
          <TextCursorInput className="mr-2 h-4 w-4" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(group.id)}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onMouseDown={() => onMove(group.id, "up", parentGroupId)}
        >
          <ChevronUp className="mr-2 h-4 w-4" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(group.id, "down", parentGroupId)}
        >
          <ChevronDown className="mr-2 h-4 w-4" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(group.id, group.name)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete Group
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
