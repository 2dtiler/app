import {
  Pencil,
  Eraser,
  Pipette,
  Move,
  PaintBucket,
  Minus,
  Square,
  SquareDashed,
  Droplets,
  BoxSelect,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { ImageEditorTool } from "@/types/image-editor";

interface ToolSidebarProps {
  currentTool: ImageEditorTool;
  onSelectTool: (tool: ImageEditorTool) => void;
}

const TOOLS: {
  id: ImageEditorTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
}[] = [
  { id: "pencil", icon: Pencil, label: "Pencil", shortcut: "B" },
  { id: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", shortcut: "I" },
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
  { id: "marquee", icon: BoxSelect, label: "Marquee", shortcut: "M" },
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
