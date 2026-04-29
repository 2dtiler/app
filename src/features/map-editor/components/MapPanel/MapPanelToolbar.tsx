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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { BRUSH_SIZES } from "@/types";
import type { MapPanelToolbarProps } from "@/features/map-editor/types/map-panel";

const brushTools = ["paint", "autotile"] as const;
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
  onSelectBrushTool,
  onSelectFillMode,
  onSelectTool,
  onZoom,
  state,
}: MapPanelToolbarProps) {
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card px-1 py-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state.currentTool === "select" ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onMouseDown={() => onSelectTool("select")}
          >
            <BoxSelect className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Select Tool (S)</TooltipContent>
      </Tooltip>

      {brushTools.map((tool) => {
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
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {tool === "autotile"
                  ? "Autotile Tool (A)"
                  : `${tool.charAt(0).toUpperCase() + tool.slice(1)} Tool`}
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

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={state.currentTool === "fill" ? "default" : "ghost"}
                size="icon"
                className="h-6 w-6"
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
          <DropdownMenuItem onMouseDown={() => onSelectFillMode("fillTerrain")}>
            Fill Terrain
            {state.currentTool === "fill" &&
              state.fillMode === "fillTerrain" &&
              " ✓"}
          </DropdownMenuItem>
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
              onMouseDown={onOpenMapOptions}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Map Options</TooltipContent>
        </Tooltip>
      )}

      <span className="ml-auto text-[10px] text-muted-foreground">
        {state.currentTool === "fill"
          ? state.fillMode === "fillTerrain"
            ? "FILL TERRAIN"
            : "FILL"
          : state.currentTool.toUpperCase()}{" "}
        {state.currentTool !== "fill" &&
          state.currentTool !== "select" &&
          state.brushSize}
      </span>
    </div>
  );
}
