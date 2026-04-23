import {
  Pencil,
  Eraser,
  Move,
  PaintBucket,
  Minus,
  Square,
  SquareDashed,
  Droplets,
  MousePointer2,
  Crop,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { ImageEditorTool } from "@/types/image-editor";
import type { ToolSidebarProps } from "@/types/image-editor/image-editor-ui";

const TOOLS: {
  id: ImageEditorTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
}[] = [
  { id: "selection", icon: MousePointer2, label: "Selection", shortcut: "S" },
  { id: "crop", icon: Crop, label: "Crop", shortcut: "C" },
  { id: "pencil", icon: Pencil, label: "Pencil", shortcut: "B" },
  { id: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
  { id: "move", icon: Move, label: "Move", shortcut: "V" },
  {
    id: "paint-bucket",
    icon: PaintBucket,
    label: "Paint Bucket",
    shortcut: "G",
  },
  { id: "line", icon: Minus, label: "Line", shortcut: "L" },
  { id: "rectangle", icon: Square, label: "Rectangle", shortcut: "R" },
  { id: "contour", icon: SquareDashed, label: "Contour", shortcut: "U" },
  { id: "blur", icon: Droplets, label: "Blur" },
];

const BRUSH_SIZE_OPTIONS = Array.from({ length: 16 }, (_, index) => index + 1);
const BLUR_SIZE_OPTIONS = Array.from({ length: 8 }, (_, index) => index + 1);

export function ToolSidebar({
  currentTool,
  brushSize,
  blurSize,
  onSelectTool,
  onBrushSize,
  onBlurSize,
}: ToolSidebarProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-0.5 p-1 bg-card border-r border-border">
        {TOOLS.map(({ id, icon: Icon, label, shortcut }) => {
          const usesBrushSize =
            id === "pencil" || id === "eraser" || id === "line";
          const isSizedTool = usesBrushSize || id === "blur";
          const selectedSize = usesBrushSize ? brushSize : blurSize;
          const sizeOptions = usesBrushSize
            ? BRUSH_SIZE_OPTIONS
            : BLUR_SIZE_OPTIONS;

          if (!isSizedTool) {
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={currentTool === id ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => onSelectTool(id)}
                    aria-label={label}
                    className={
                      currentTool === id
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 ring-1 ring-primary/50"
                        : undefined
                    }
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {label}
                  {shortcut && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({shortcut})
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <DropdownMenu key={id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={currentTool === id ? "secondary" : "ghost"}
                      size="icon-sm"
                      onClick={() => onSelectTool(id)}
                      aria-label={label}
                      className={
                        currentTool === id
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 ring-1 ring-primary/50"
                          : undefined
                      }
                    >
                      <Icon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {label}
                  {shortcut && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({shortcut})
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="right" align="start" sideOffset={8}>
                {sizeOptions.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onSelect={() => {
                      onSelectTool(id);
                      if (usesBrushSize) {
                        onBrushSize(size);
                        return;
                      }
                      onBlurSize(size);
                    }}
                  >
                    {size} px
                    {currentTool === id && selectedSize === size ? " ✓" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
