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
  "ai-assets": { label: "AI Assets Generator", component: AiAssets },
};

interface ToolDrawerProps {
  activeTool: ToolName | null;
  onClose: () => void;
}

const SLIDE_DURATION = 350;

export function ToolDrawer({ activeTool, onClose }: ToolDrawerProps) {
  const config = activeTool ? TOOL_CONFIG[activeTool] : null;
  const ToolComponent = config?.component ?? null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // CSS keyframe animations (drawer-enter / drawer-exit) auto-play when the
  // class is applied — no before/after state flip needed, no flushSync.
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);
  const rafRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timerRef.current);

    if (activeTool !== null) {
      rafRef.current = requestAnimationFrame(() => {
        setIsMounted(true);
        setIsClosing(false);
        setIsContentVisible(false);
        setTimeout(() => closeButtonRef.current?.focus(), 50);
        // Reveal content after slide-in completes.
        timerRef.current = setTimeout(
          () => setIsContentVisible(true),
          SLIDE_DURATION + 30,
        );
      });
    } else {
      rafRef.current = requestAnimationFrame(() => {
        setIsContentVisible(false);
        setIsClosing(true);
      });
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
    };
  }, [activeTool]);

  // Keyboard: Escape closes the drawer.
  useEffect(() => {
    if (!isMounted || isClosing) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMounted, isClosing, onClose]);

  function handleAnimationEnd(e: React.AnimationEvent) {
    // Ignore bubbled events from child elements.
    if (e.target !== e.currentTarget) return;
    if (isClosing) {
      setIsMounted(false);
      setIsClosing(false);
    }
  }

  if (!isMounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity,backdrop-filter] duration-[350ms] ease-out ${
          isClosing ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        onClick={onClose}
      />

      {/* Panel — drawer-enter/drawer-exit keyframes defined in index.css */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-[90%] flex-col bg-background border-l shadow-xl ${
          isClosing ? "drawer-exit" : "drawer-enter"
        }`}
        onAnimationEnd={handleAnimationEnd}
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

        {/* Content – hidden while sliding to avoid layout thrash */}
        <div
          className={`min-h-0 flex-1 overflow-hidden transition-opacity duration-150 ${
            isContentVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
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
