import {
  BoxSelect,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Paintbrush,
  PaintBucket,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Settings,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { getPaintableAutotileTerrains } from "@/features/map-editor/lib/autotile";
import { BRUSH_SIZES } from "@/types";
import type { MapPanelToolbarProps } from "@/features/map-editor/types/map-panel";

const eraseTools = ["erase"] as const;
const toolIcons = {
  select: BoxSelect,
  paint: Paintbrush,
  autotile: WandSparkles,
  erase: Eraser,
  fill: PaintBucket,
} as const;

export function MapPanelToolbar({
  activeMap,
  canCutToolbar,
  canOrientToolbar,
  controls,
  mapZoom,
  onCut,
  onOpenMapOptions,
  onOrientSelection,
  onSelectAutotileTool,
  onSelectBrushTool,
  onSelectFillMode,
  onSelectFillTerrain,
  onSelectPaintTerrain,
  onOpenTerrainDialog,
  onSelectTool,
  onZoom,
  state,
}: MapPanelToolbarProps) {
  const activeTileset = state.project?.tilesets.find(
    (tileset) => tileset.id === state.activeTilesetId,
  );
  const autotileRules = getPaintableAutotileTerrains(activeTileset?.autotile);
  const savedTerrains = state.project?.terrains ?? [];
  const activeToolLabel =
    state.currentTool === "paint"
      ? state.paintMode === "paintTerrain"
        ? "PAINT TERRAIN"
        : "PAINT"
      : state.currentTool === "fill"
        ? state.fillMode === "fillTerrain"
          ? "FILL TERRAIN"
          : "FILL"
        : state.currentTool.toUpperCase();

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card px-1 py-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state.currentTool === "select" ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            aria-label="Select tool"
            onMouseDown={() => onSelectTool("select")}
          >
            <BoxSelect className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Select Tool (S)</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={state.currentTool === "paint" ? "default" : "ghost"}
                size="icon"
                className="h-6 w-6"
                aria-label="Paint tool options"
              >
                <Paintbrush className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Paint Tool (B)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Paint
              {state.currentTool === "paint" &&
                state.paintMode === "paint" &&
                " ✓"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {BRUSH_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onMouseDown={() => onSelectBrushTool("paint", size)}
                >
                  {size}
                  {state.currentTool === "paint" &&
                    state.paintMode === "paint" &&
                    state.brushSize === size &&
                    " ✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Paint Terrain
              {state.currentTool === "paint" &&
                state.paintMode === "paintTerrain" &&
                " ✓"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onMouseDown={() => onOpenTerrainDialog("paint")}
              >
                Create / New Terrain
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {savedTerrains.length === 0 ? (
                <DropdownMenuItem disabled>No saved terrains</DropdownMenuItem>
              ) : (
                savedTerrains.map((terrain) => (
                  <DropdownMenuSub key={terrain.id}>
                    <DropdownMenuSubTrigger>
                      {terrain.name}
                      {state.currentTool === "paint" &&
                        state.paintMode === "paintTerrain" &&
                        state.selectedPaintTerrainId === terrain.id &&
                        " ✓"}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {BRUSH_SIZES.map((size) => (
                        <DropdownMenuItem
                          key={size}
                          onMouseDown={() =>
                            onSelectPaintTerrain(terrain.id, size)
                          }
                        >
                          {size}
                          {state.currentTool === "paint" &&
                            state.paintMode === "paintTerrain" &&
                            state.selectedPaintTerrainId === terrain.id &&
                            state.brushSize === size &&
                            " ✓"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={state.currentTool === "autotile" ? "default" : "ghost"}
                size="icon"
                className="h-6 w-6"
                aria-label="Autotile tool options"
              >
                <WandSparkles className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Autotile Tool (A)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent>
          {autotileRules.length === 0 ? (
            <>
              <DropdownMenuLabel>
                {activeTileset ? "No autotile rules" : "No active tileset"}
              </DropdownMenuLabel>
              <DropdownMenuItem disabled>
                {activeTileset
                  ? "Configure a paint tile in the autotile editor first."
                  : "Select a tileset to choose autotile rules."}
              </DropdownMenuItem>
            </>
          ) : (
            autotileRules.map((terrain, index) => {
              const isSelectedTerrain =
                state.selectedAutotileTerrain?.tilesetId ===
                  activeTileset?.id &&
                state.selectedAutotileTerrain?.terrainId === terrain.id;

              return (
                <DropdownMenuSub key={terrain.id}>
                  <DropdownMenuSubTrigger>
                    {terrain.name || `Rule ${index + 1}`}
                    {isSelectedTerrain && " ✓"}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {BRUSH_SIZES.map((size) => (
                      <DropdownMenuItem
                        key={size}
                        onMouseDown={() =>
                          onSelectAutotileTool(terrain.id, size)
                        }
                      >
                        {size}
                        {state.currentTool === "autotile" &&
                          isSelectedTerrain &&
                          state.brushSize === size &&
                          " ✓"}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={state.currentTool === "fill" ? "default" : "ghost"}
                size="icon"
                className="h-6 w-6"
                aria-label="Fill tool options"
              >
                <PaintBucket className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Fill Tool (G)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent>
          <DropdownMenuItem onMouseDown={() => onSelectFillMode("fill")}>
            Fill
            {state.currentTool === "fill" && state.fillMode === "fill" && " ✓"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Fill Terrain
              {state.currentTool === "fill" &&
                state.fillMode === "fillTerrain" &&
                " ✓"}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onMouseDown={() => onOpenTerrainDialog("fill")}>
                Create / New Terrain
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {savedTerrains.length === 0 ? (
                <DropdownMenuItem disabled>No saved terrains</DropdownMenuItem>
              ) : (
                savedTerrains.map((terrain) => (
                  <DropdownMenuItem
                    key={terrain.id}
                    onMouseDown={() => onSelectFillTerrain(terrain.id)}
                  >
                    {terrain.name}
                    {state.currentTool === "fill" &&
                      state.fillMode === "fillTerrain" &&
                      state.selectedFillTerrainId === terrain.id &&
                      " ✓"}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {eraseTools.map((tool) => {
        const Icon = toolIcons[tool];
        const isActive = state.currentTool === tool;

        return (
          <DropdownMenu key={tool}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`${tool.charAt(0).toUpperCase() + tool.slice(1)} tool options`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {tool.charAt(0).toUpperCase() + tool.slice(1)} Tool
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent>
              {BRUSH_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onMouseDown={() => onSelectBrushTool(tool, size)}
                >
                  {size}
                  {state.currentTool === tool &&
                    state.brushSize === size &&
                    " ✓"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      <div className="mx-0.5 h-4 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Cut selection"
            disabled={!canCutToolbar}
            onMouseDown={() => {
              void onCut();
            }}
          >
            <Scissors className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cut (Ctrl+X)</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Orientation actions"
                disabled={!canOrientToolbar}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Orientation (select tool only)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={!canOrientToolbar}
            onMouseDown={() => onOrientSelection("rotateLeft")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Rotate Left 90°
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canOrientToolbar}
            onMouseDown={() => onOrientSelection("rotateRight")}
          >
            <RotateCw className="h-3.5 w-3.5" />
            Rotate Right 90°
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canOrientToolbar}
            onMouseDown={() => onOrientSelection("flipH")}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
            Flip Horizontal
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canOrientToolbar}
            onMouseDown={() => onOrientSelection("flipV")}
          >
            <FlipVertical2 className="h-3.5 w-3.5" />
            Flip Vertical
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Zoom out"
              onMouseDown={() => onZoom(-1)}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out (-)</TooltipContent>
        </Tooltip>
        <span className="w-8 text-center text-[10px] text-muted-foreground">
          {Math.round(mapZoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Zoom in"
              onMouseDown={() => onZoom(1)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In (+)</TooltipContent>
        </Tooltip>
      </div>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Undo"
            disabled={!controls.canBack()}
            onMouseDown={() => controls.back()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Redo"
            disabled={!controls.canForward()}
            onMouseDown={() => controls.forward()}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {activeMap && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Map options"
              onMouseDown={onOpenMapOptions}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Map Options</TooltipContent>
        </Tooltip>
      )}

      <span className="ml-auto text-[10px] text-muted-foreground">
        {activeToolLabel}{" "}
        {state.currentTool !== "fill" &&
          state.currentTool !== "select" &&
          state.brushSize}
      </span>
    </div>
  );
}
