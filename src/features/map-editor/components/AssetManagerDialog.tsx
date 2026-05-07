import { useEffect, useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical, PencilLine, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  getAssetManagerGroupDropPosition,
  getAssetManagerItemDropPosition,
} from "@/features/map-editor/lib/asset-manager";
import type {
  AssetManagerDialogProps,
  AssetManagerDragState,
  AssetManagerGroupDropState,
  AssetManagerItemDropState,
} from "@/features/map-editor/types/asset-manager";
import { cn } from "@/utils/cn";

function getGroupDeleteLabel(reason?: string) {
  return reason ?? "Move or delete all items before deleting this group.";
}

export function AssetManagerDialog({
  open,
  onOpenChange,
  title,
  description,
  groupSectionTitle,
  itemSectionTitle,
  createGroupLabel,
  createItemLabel,
  emptyItemsMessage,
  groups,
  items,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onCreateItem,
  onRenameGroup,
  onDeleteGroup,
  onRenameItem,
  onDeleteItem,
  onReorderGroups,
  onMoveItemToGroup,
  onReorderItems,
}: AssetManagerDialogProps) {
  const [dragState, setDragState] = useState<AssetManagerDragState | null>(
    null,
  );
  const [groupDropState, setGroupDropState] =
    useState<AssetManagerGroupDropState | null>(null);
  const [itemDropState, setItemDropState] =
    useState<AssetManagerItemDropState | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [renameItemValue, setRenameItemValue] = useState("");

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;

  useEffect(() => {
    if (open) {
      return;
    }

    setDragState(null);
    setGroupDropState(null);
    setItemDropState(null);
    setRenamingGroupId(null);
    setRenameGroupValue("");
    setRenamingItemId(null);
    setRenameItemValue("");
  }, [open]);

  function handleSelectGroup(groupId: string) {
    if (groupId !== selectedGroupId) {
      onSelectGroup(groupId);
    }
  }

  function handleGroupKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    groupId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleSelectGroup(groupId);
  }

  function resetDragState() {
    setDragState(null);
    setGroupDropState(null);
    setItemDropState(null);
  }

  function beginGroupRename(groupId: string, name: string) {
    setRenamingItemId(null);
    setRenameItemValue("");
    setRenamingGroupId(groupId);
    setRenameGroupValue(name);
  }

  function commitGroupRename() {
    if (!renamingGroupId) {
      return;
    }

    const name = renameGroupValue.trim();
    if (name) {
      onRenameGroup(renamingGroupId, name);
    }

    setRenamingGroupId(null);
    setRenameGroupValue("");
  }

  function beginItemRename(itemId: string, name: string) {
    setRenamingGroupId(null);
    setRenameGroupValue("");
    setRenamingItemId(itemId);
    setRenameItemValue(name);
  }

  function commitItemRename() {
    if (!renamingItemId) {
      return;
    }

    const name = renameItemValue.trim();
    if (name) {
      onRenameItem(renamingItemId, name);
    }

    setRenamingItemId(null);
    setRenameItemValue("");
  }

  function handleGroupDragOver(
    event: DragEvent<HTMLDivElement>,
    groupId: string,
  ) {
    if (!dragState) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = getAssetManagerGroupDropPosition(
      dragState.type,
      event.clientY - rect.top,
      rect.height,
    );
    setGroupDropState({ targetId: groupId, position });
  }

  function handleGroupDrop(event: DragEvent<HTMLDivElement>, groupId: string) {
    if (!dragState) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = getAssetManagerGroupDropPosition(
      dragState.type,
      event.clientY - rect.top,
      rect.height,
    );

    if (dragState.type === "group") {
      if (position !== "inside") {
        onReorderGroups(dragState.id, groupId, position);
      }
    } else {
      onMoveItemToGroup(dragState.id, groupId);
      onSelectGroup(groupId);
    }

    resetDragState();
  }

  function handleItemDragOver(
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) {
    if (dragState?.type !== "item") {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = getAssetManagerItemDropPosition(
      event.clientY - rect.top,
      rect.height,
    );
    setItemDropState({ targetId: itemId, position });
  }

  function handleItemDrop(event: DragEvent<HTMLDivElement>, itemId: string) {
    if (dragState?.type !== "item") {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = getAssetManagerItemDropPosition(
      event.clientY - rect.top,
      rect.height,
    );
    onReorderItems(dragState.id, itemId, position);
    resetDragState();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(70rem,calc(100%-2rem))] gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[32rem] grid-cols-[19rem_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-r border-border bg-card/60">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {groupSectionTitle}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {groups.length} total
                </div>
              </div>
              <Button type="button" size="xs" onClick={onCreateGroup}>
                <Plus className="h-3 w-3" />
                {createGroupLabel}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-2">
                {groups.map((group) => {
                  const isSelected = group.id === selectedGroupId;
                  const isRenaming = group.id === renamingGroupId;
                  const dropPosition =
                    groupDropState?.targetId === group.id
                      ? groupDropState.position
                      : null;

                  return (
                    <div
                      key={group.id}
                      className={cn(
                        "relative rounded-2xl border border-border bg-background/80 p-3 shadow-sm transition-colors",
                        isSelected && "border-foreground bg-secondary/60",
                        dragState?.type === "group" &&
                          dropPosition === "inside" &&
                          "bg-secondary/80",
                      )}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", group.id);
                        setDragState({ type: "group", id: group.id });
                      }}
                      onDragEnd={resetDragState}
                      onDragOver={(event) =>
                        handleGroupDragOver(event, group.id)
                      }
                      onDrop={(event) => handleGroupDrop(event, group.id)}
                    >
                      {dragState?.type === "group" &&
                      dropPosition === "above" ? (
                        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-foreground" />
                      ) : null}
                      {dragState?.type === "group" &&
                      dropPosition === "below" ? (
                        <div className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-foreground" />
                      ) : null}

                      <div
                        role="button"
                        tabIndex={0}
                        className="flex min-w-0 items-start gap-3"
                        onClick={() => handleSelectGroup(group.id)}
                        onKeyDown={(event) =>
                          handleGroupKeyDown(event, group.id)
                        }
                      >
                        <div className="mt-0.5 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            Group
                          </div>
                          {isRenaming ? (
                            <Input
                              id={`asset-manager-group-${group.id}`}
                              name={`asset-manager-group-${group.id}`}
                              aria-label={`Rename group ${group.name}`}
                              className="mt-2 h-9 rounded-lg text-xs"
                              value={renameGroupValue}
                              onBlur={commitGroupRename}
                              onChange={(event) =>
                                setRenameGroupValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commitGroupRename();
                                }
                                if (event.key === "Escape") {
                                  setRenamingGroupId(null);
                                  setRenameGroupValue("");
                                }
                              }}
                            />
                          ) : (
                            <>
                              <div className="mt-1 truncate text-sm text-foreground">
                                {group.name}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                {group.itemCount}{" "}
                                {group.itemCount === 1 ? "item" : "items"}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Rename group ${group.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              beginGroupRename(group.id, group.name);
                            }}
                          >
                            <PencilLine className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete group ${group.name}`}
                            disabled={!group.canDelete}
                            title={
                              !group.canDelete
                                ? getGroupDeleteLabel(
                                    group.deleteDisabledReason,
                                  )
                                : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteGroup(group.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {!group.canDelete && group.deleteDisabledReason ? (
                        <div className="mt-2 pl-7 text-[11px] text-muted-foreground">
                          {group.deleteDisabledReason}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {itemSectionTitle}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedGroup
                    ? `${selectedGroup.name} · ${items.length} items`
                    : "Select a group"}
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                disabled={!selectedGroupId}
                onClick={() => {
                  if (selectedGroupId) {
                    onCreateItem(selectedGroupId);
                  }
                }}
              >
                <Plus className="h-3 w-3" />
                {createItemLabel}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {selectedGroup ? (
                items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isRenaming = item.id === renamingItemId;
                      const dropPosition =
                        itemDropState?.targetId === item.id
                          ? itemDropState.position
                          : null;

                      return (
                        <div
                          key={item.id}
                          className="relative rounded-2xl border border-border bg-card/70 p-3 shadow-sm"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", item.id);
                            setDragState({ type: "item", id: item.id });
                          }}
                          onDragEnd={resetDragState}
                          onDragOver={(event) =>
                            handleItemDragOver(event, item.id)
                          }
                          onDrop={(event) => handleItemDrop(event, item.id)}
                        >
                          {dragState?.type === "item" &&
                          dropPosition === "above" ? (
                            <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-foreground" />
                          ) : null}
                          {dragState?.type === "item" &&
                          dropPosition === "below" ? (
                            <div className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-foreground" />
                          ) : null}

                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              <GripVertical className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                Item
                              </div>
                              {isRenaming ? (
                                <Input
                                  id={`asset-manager-item-${item.id}`}
                                  name={`asset-manager-item-${item.id}`}
                                  aria-label={`Rename item ${item.name}`}
                                  className="mt-2 h-9 rounded-lg text-xs"
                                  value={renameItemValue}
                                  onBlur={commitItemRename}
                                  onChange={(event) =>
                                    setRenameItemValue(event.target.value)
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      commitItemRename();
                                    }
                                    if (event.key === "Escape") {
                                      setRenamingItemId(null);
                                      setRenameItemValue("");
                                    }
                                  }}
                                />
                              ) : (
                                <>
                                  <div className="mt-1 truncate text-sm text-foreground">
                                    {item.name}
                                  </div>
                                  {item.subtitle ? (
                                    <div className="mt-2 truncate text-xs text-muted-foreground">
                                      {item.subtitle}
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Rename item ${item.name}`}
                                onClick={() =>
                                  beginItemRename(item.id, item.name)
                                }
                              >
                                <PencilLine className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Delete item ${item.name}`}
                                onClick={() => onDeleteItem(item.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 text-center text-sm text-muted-foreground">
                    {emptyItemsMessage}
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 text-center text-sm text-muted-foreground">
                  Select a group to manage its items.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter
          className="border-t border-border px-6 py-4"
          showCloseButton
        />
      </DialogContent>
    </Dialog>
  );
}
