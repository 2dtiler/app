import {
  type ComponentType,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // `isOpen` drives the CSS transition; `isMounted` keeps the DOM node alive
  // during the exit animation.
  const [isMounted, setIsMounted] = useState(activeTool !== null);
  const [isOpen, setIsOpen] = useState(activeTool !== null);

  useEffect(() => {
    if (activeTool !== null) {
      // First RAF: mount the element so it's in the DOM with translate-x-full.
      // Second RAF: flip isOpen so the CSS transition plays.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        setIsMounted(true);
        raf2 = requestAnimationFrame(() => {
          setIsOpen(true);
          setTimeout(() => closeButtonRef.current?.focus(), 50);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    } else {
      // Wrap in RAF to avoid synchronous setState-in-effect lint error.
      const raf = requestAnimationFrame(() => setIsOpen(false));
      return () => cancelAnimationFrame(raf);
    }
  }, [activeTool]);

  // Keyboard: Escape closes the drawer.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function handleTransitionEnd() {
    if (!isOpen) setIsMounted(false);
  }

  if (!isMounted) return null;

  return createPortal(
    <>
      {/* Backdrop – click to close */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity,backdrop-filter] duration-[350ms] ease-out ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-[90%] flex-col bg-background border-l shadow-xl transition-[transform,opacity] duration-[350ms] ${
          isOpen
            ? "translate-x-0 opacity-100 ease-[cubic-bezier(0.32,0.72,0,1)]"
            : "translate-x-full opacity-0 ease-[cubic-bezier(0.72,0,0.84,0)]"
        }`}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {config?.label ?? ""}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {ToolComponent && (
            <Suspense>
              <ToolComponent />
            </Suspense>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
