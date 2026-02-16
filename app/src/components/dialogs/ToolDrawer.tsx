import type { ComponentType } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { ToolName } from "@/components/layout/Toolbar";
import { ImageEditor } from "@/components/tools/ImageEditor";
import { AiAssets } from "@/components/tools/AiAssets";
import { SpriteGenerator } from "@/components/tools/SpriteGenerator";

const TOOL_CONFIG: Record<
  ToolName,
  { label: string; component: ComponentType }
> = {
  "image-editor": { label: "Image Editor", component: ImageEditor },
  "ai-assets": { label: "AI Assets", component: AiAssets },
  "sprite-generator": { label: "Sprite Generator", component: SpriteGenerator },
};

interface ToolDrawerProps {
  activeTool: ToolName | null;
  onClose: () => void;
}

export function ToolDrawer({ activeTool, onClose }: ToolDrawerProps) {
  const config = activeTool ? TOOL_CONFIG[activeTool] : null;
  const ToolComponent = config?.component ?? null;

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
          <DrawerTitle className="text-lg">{config?.label ?? ""}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {config?.label ?? "Tool panel"}
          </DrawerDescription>
        </DrawerHeader>
        {ToolComponent && <ToolComponent />}
      </DrawerContent>
    </Drawer>
  );
}
