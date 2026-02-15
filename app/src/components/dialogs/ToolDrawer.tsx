import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { ToolName } from "@/components/layout/Toolbar";

const TOOL_LABELS: Record<ToolName, string> = {
  "image-editor": "Image Editor",
  "ai-assets": "AI Assets",
  "sprite-generator": "Sprite Generator",
};

interface ToolDrawerProps {
  activeTool: ToolName | null;
  onClose: () => void;
}

export function ToolDrawer({ activeTool, onClose }: ToolDrawerProps) {
  return (
    <Drawer
      direction="right"
      open={activeTool !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="w-[90%] sm:max-w-none">
        <DrawerHeader>
          <DrawerTitle className="text-lg">
            {activeTool ? TOOL_LABELS[activeTool] : ""}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {activeTool ? TOOL_LABELS[activeTool] : "Tool panel"}
          </DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>
  );
}
