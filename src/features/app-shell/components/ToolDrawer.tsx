import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ToolDrawerProps, ToolName } from "@/features/app-shell/types";

const ImageEditor = lazy(() =>
  import("@/features/image-editor").then((module) => ({
    default: module.ImageEditor,
  })),
);
const AiAssets = lazy(() =>
  import("@/features/ai-assets").then((module) => ({
    default: module.AiAssets,
  })),
);

const TOOL_LABELS: Record<ToolName, string> = {
  "image-editor": "Image/Sprite Editor",
  "ai-assets": "AI Assets Generator",
};

const SLIDE_DURATION = 350;

export function ToolDrawer({ activeTool, onClose }: ToolDrawerProps) {
  const toolLabel = activeTool ? TOOL_LABELS[activeTool] : "";
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const handleCloseRequest = useCallback(() => {
    if (activeTool === "image-editor") {
      window.dispatchEvent(new Event("image-editor-request-close"));
      return;
    }
    onClose();
  }, [activeTool, onClose]);

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

  useEffect(() => {
    if (!isMounted || isClosing) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleCloseRequest();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseRequest, isMounted, isClosing]);

  function handleAnimationEnd(event: React.AnimationEvent) {
    if (event.target !== event.currentTarget) return;
    if (isClosing) {
      setIsMounted(false);
      setIsClosing(false);
    }
  }

  if (!isMounted) return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity,backdrop-filter] duration-350 ease-out ${
          isClosing ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        onClick={handleCloseRequest}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-[90%] flex-col border-l bg-background shadow-xl ${
          isClosing ? "drawer-exit" : "drawer-enter"
        }`}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {toolLabel}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleCloseRequest}
            className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-hidden transition-opacity duration-150 ${
            isContentVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {activeTool === "image-editor" && (
            <Suspense>
              <ImageEditor onRequestClose={onClose} />
            </Suspense>
          )}
          {activeTool === "ai-assets" && (
            <Suspense>
              <AiAssets />
            </Suspense>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
