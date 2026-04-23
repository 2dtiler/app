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
import type { MapPanelTabsProps } from "@/features/map-editor/types/map-panel";

export function MapPanelTabs({
  activeGroup,
  groupMaps,
  onAddMap,
  onCancelRename,
  onCommitRename,
  onDuplicateMap,
  onGroupChange,
  onRequestDeleteTarget,
  onSelectMap,
  onStartRenamingTab,
  project,
  renameInputRef,
  renameValue,
  renamingTabId,
  setRenameValue,
  state,
}: MapPanelTabsProps) {
  function requestDeleteMap(mapId: string, mapName: string) {
    onRequestDeleteTarget({
      type: "map",
      id: mapId,
      name: mapName,
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1 py-0.5">
      <Select
        value={state.activeMapGroupId ?? ""}
        onValueChange={onGroupChange}
      >
        <SelectTrigger className="h-6 w-25 shrink-0 text-xs">
          <SelectValue placeholder="Group" />
        </SelectTrigger>
        <SelectContent>
          {project.mapGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
          <SelectItem value="__add__">+ Add Group</SelectItem>
        </SelectContent>
      </Select>

      {activeGroup && project.mapGroups.length > 1 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-destructive"
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

      {groupMaps.length > 0 && (
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs
            value={state.activeMapId ?? ""}
            onValueChange={(value) => onSelectMap(value as never)}
          >
            <TabsList
              variant="editor"
              className="h-8 rounded-none bg-transparent p-0"
              scrollable
            >
              {groupMaps.map((map) => (
                <div
                  key={map.id}
                  data-state={
                    state.activeMapId === map.id ? "active" : "inactive"
                  }
                  className="group/tab -mb-px flex h-7 min-w-0 items-center rounded-t-sm border border-transparent border-b-border/70 bg-muted/20 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  {renamingTabId === map.id ? (
                    <input
                      ref={renameInputRef}
                      id={`rename-map-tab-${map.id}`}
                      name={`rename-map-tab-${map.id}`}
                      aria-label={`Rename map ${map.name}`}
                      className="mx-1 h-6 w-28 rounded border border-primary bg-background px-1 text-xs"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={onCommitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onCommitRename();
                        if (event.key === "Escape") onCancelRename();
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
                                  value={map.id}
                                  className="h-7 min-w-0 rounded-none px-2 text-[11px]"
                                  onDoubleClick={() => onStartRenamingTab(map)}
                                >
                                  <span className="max-w-40 truncate">
                                    {map.name}
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
                          onMouseDown={() => onStartRenamingTab(map)}
                        >
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onMouseDown={() => onDuplicateMap(map)}
                        >
                          Duplicate
                        </ContextMenuItem>
                        <ContextMenuItem
                          onMouseDown={() => requestDeleteMap(map.id, map.name)}
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
                        aria-label={`Close map ${map.name}`}
                        className="pointer-events-none mr-1 flex h-5 w-5 flex-none items-center justify-center rounded-sm text-muted-foreground/80 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-data-[state=active]/tab:pointer-events-auto group-data-[state=active]/tab:opacity-100"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          requestDeleteMap(map.id, map.name);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Close Map</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {!groupMaps.length && <div className="flex-1" />}

      <Button
        variant="default"
        size="sm"
        className="h-6 shrink-0 px-2 text-[10px]"
        onMouseDown={onAddMap}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Map
      </Button>
    </div>
  );
}
