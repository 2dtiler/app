import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import type { TilesetPanelTabsProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetPanelTabs({
  activeGroup,
  groupTilesets,
  onAddTileset,
  onCancelRename,
  onCommitRename,
  onDuplicateTileset,
  onGroupChange,
  onRequestDeleteTarget,
  onSelectTileset,
  onStartRenamingTab,
  project,
  renameInputRef,
  renameValue,
  renamingTabId,
  setRenameValue,
  state,
}: TilesetPanelTabsProps) {
  const orderedGroups = [...project.tilesetGroups].sort(
    (left, right) => left.order - right.order,
  );

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1 py-0.5">
      <Select
        value={state.activeTilesetGroupId ?? ""}
        onValueChange={onGroupChange}
      >
        <SelectTrigger className="h-6 w-25 shrink-0 text-xs">
          <SelectValue placeholder="Group" />
        </SelectTrigger>
        <SelectContent>
          {orderedGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
          <SelectItem value="__add__">
            <span aria-hidden="true">✚</span>
            <span>Add Group</span>
          </SelectItem>
          <SelectItem value="__manage__">
            <span aria-hidden="true">🛠</span>
            <span>Manage Tilesets</span>
          </SelectItem>
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
                onRequestDeleteTarget({
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
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs
            value={state.activeTilesetId ?? ""}
            onValueChange={(value) =>
              onSelectTileset(
                value as Parameters<
                  TilesetPanelTabsProps["onSelectTileset"]
                >[0],
              )
            }
          >
            <TabsList
              variant="editor"
              className="h-8 rounded-none bg-transparent p-0"
              scrollable
            >
              {groupTilesets.map((tileset) => (
                <div
                  key={tileset.id}
                  data-state={
                    state.activeTilesetId === tileset.id ? "active" : "inactive"
                  }
                  className="group/tab -mb-px flex h-7 min-w-0 items-center rounded-t-sm border border-transparent border-b-border/70 bg-muted/20 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  {renamingTabId === tileset.id ? (
                    <input
                      ref={renameInputRef}
                      id={`rename-tileset-tab-${tileset.id}`}
                      name={`rename-tileset-tab-${tileset.id}`}
                      aria-label={`Rename tileset ${tileset.name}`}
                      className="mx-1 h-6 w-28 rounded border border-primary bg-background px-1 text-xs"
                      value={renameValue}
                      onBlur={onCommitRename}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onCommitRename();
                        }
                        if (event.key === "Escape") {
                          onCancelRename();
                        }
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
                                  value={tileset.id}
                                  className="h-7 min-w-0 rounded-none px-2 text-[11px]"
                                  onDoubleClick={() =>
                                    onStartRenamingTab(tileset)
                                  }
                                >
                                  <span className="max-w-40 truncate">
                                    {tileset.name}
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
                          onMouseDown={() => onStartRenamingTab(tileset)}
                        >
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onMouseDown={() => onDuplicateTileset(tileset)}
                        >
                          Duplicate
                        </ContextMenuItem>
                        <ContextMenuItem
                          onMouseDown={() =>
                            onRequestDeleteTarget({
                              type: "tileset",
                              id: tileset.id,
                              name: tileset.name,
                            })
                          }
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
                        aria-label={`Close tileset ${tileset.name}`}
                        className="pointer-events-none mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-sm text-muted-foreground/80 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-data-[state=active]/tab:pointer-events-auto group-data-[state=active]/tab:opacity-100"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRequestDeleteTarget({
                            type: "tileset",
                            id: tileset.id,
                            name: tileset.name,
                          });
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
        className="h-6 shrink-0 px-2 text-[10px]"
        onClick={onAddTileset}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Tileset
      </Button>
    </div>
  );
}
