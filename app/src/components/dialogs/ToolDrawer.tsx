import { type ComponentType, lazy, Suspense } from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { ToolName } from "@/components/layout/Toolbar";

const ImageEditor = lazy(() =>
  import("@/components/tools/ImageEditor").then((m) => ({
    default: m.ImageEditor,
  })),
);
const AiAssets = lazy(() =>
  import("@/components/tools/AiAssets").then((m) => ({ default: m.AiAssets })),
);

const TOOL_CONFIG: Record<
  ToolName,
  { label: string; component: ComponentType }
> = {
  "image-editor": { label: "Image/Sprite Editor", component: ImageEditor },
  "ai-assets": { label: "AI Assets", component: AiAssets },
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
      dismissible={false}
      open={activeTool !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="w-[90%] sm:max-w-none">
        <DrawerHeader className="relative">
          <DrawerTitle className="text-lg">{config?.label ?? ""}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {config?.label ?? "Tool panel"}
          </DrawerDescription>
          <DrawerClose className="absolute right-4 top-1/2 -translate-y-1/2 rounded-sm opacity-70 hover:opacity-100 focus:outline-none">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        {ToolComponent && (
          <Suspense>
            <ToolComponent />
          </Suspense>
        )}
      </DrawerContent>
    </Drawer>
  );
}
