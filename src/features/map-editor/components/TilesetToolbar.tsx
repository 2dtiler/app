import { Film, Save, WandSparkles, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { saveProjectAndNotify } from "@/features/project-management/lib/project-save";
import { TILE_SIZES } from "@/types";
import type { TilesetToolbarProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetToolbar({
  project,
  activeTileSize,
  activeTileset,
  animationsVisible,
  tilesetZoom,
  onTileSizeChange,
  onZoom,
  onOpenAutotile,
  onAnimationsVisibleChange,
}: TilesetToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-1 py-2 border-b border-border bg-card shrink-0 flex-wrap">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Save project"
            onClick={() => {
              void saveProjectAndNotify(project);
            }}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save Project (Ctrl+S)</TooltipContent>
      </Tooltip>

      <Select value={String(activeTileSize)} onValueChange={onTileSizeChange}>
        <SelectTrigger className="h-6 w-18 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TILE_SIZES.map((tileSize) => (
            <SelectItem key={tileSize} value={String(tileSize)}>
              {tileSize}px
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Zoom tileset out"
              onClick={() => onZoom(-1)}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground w-8 text-center">
          {Math.round(tilesetZoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Zoom tileset in"
              onClick={() => onZoom(1)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTileset?.autotile ? "outline" : "ghost"}
              size="xs"
              className="h-6 px-2.5"
              disabled={!activeTileset}
              aria-label="Open autotile setup"
              onClick={onOpenAutotile}
            >
              <WandSparkles className="h-3.5 w-3.5" />
              Autotile
            </Button>
          </TooltipTrigger>
          <TooltipContent>Autotile</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              type="button"
              variant={animationsVisible ? "outline" : "default"}
              size="sm"
              className="h-6 min-w-0 shrink-0 gap-1 border border-border-visible bg-transparent px-2.5 font-mono font-normal uppercase tracking-[0.08em] text-[10px] text-muted-foreground transition-colors duration-200 ease-out shadow-none disabled:opacity-40 focus-visible:border-ring focus-visible:ring-0 aria-invalid:ring-0 dark:aria-invalid:ring-0 hover:border-foreground hover:bg-secondary hover:text-foreground data-[state=on]:bg-transparent [&_svg:not([class*='size-'])]:size-3"
              disabled={!activeTileset}
              pressed={animationsVisible}
              aria-label="Toggle animations"
              onPressedChange={onAnimationsVisibleChange}
            >
              <Film className="h-3.5 w-3.5" />
              Animations
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Toggle Animations</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
