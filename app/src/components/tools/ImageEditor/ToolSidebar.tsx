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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { ImageEditorTool } from "@/types/image-editor";
import type { ToolSidebarProps } from "@/types/image-editor-ui";

const TOOLS: {
  id: ImageEditorTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
}[] = [
  { id: "selection", icon: MousePointer2, label: "Selection", shortcut: "S" },
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

export function ToolSidebar({ currentTool, onSelectTool }: ToolSidebarProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-0.5 p-1 bg-card border-r border-border">
        {TOOLS.map(({ id, icon: Icon, label, shortcut }) => (
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
        ))}
      </div>
    </TooltipProvider>
  );
}
