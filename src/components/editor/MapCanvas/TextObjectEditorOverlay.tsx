import { useEffect, useRef } from "react";
import { getTextObjectSettings } from "@/lib/text-objects";
import type { TextObjectEditorOverlayProps } from "@/types";

export function TextObjectEditorOverlay({
  object,
  text,
  zoom,
  onTextChange,
  onCommit,
  onCancel,
}: TextObjectEditorOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settings = getTextObjectSettings(object);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [object.id]);

  return (
    <textarea
      ref={textareaRef}
      id="text-object-editor"
      name="text-object-editor"
      aria-label="Text object editor"
      spellCheck={false}
      value={text}
      onChange={(event) => onTextChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommit();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: object.x * zoom,
        top: object.y * zoom,
        width: Math.max(object.width * zoom, 24),
        height: Math.max(object.height * zoom, 24),
        padding: 4,
        resize: "none",
        overflow: "hidden",
        border: "1px solid rgba(0, 170, 255, 0.95)",
        outline: "2px solid rgba(255, 255, 255, 0.8)",
        outlineOffset: -1,
        background: "rgba(255, 255, 255, 0.96)",
        color: settings.color,
        fontFamily: settings.font,
        fontSize: `${settings.size * zoom}px`,
        lineHeight: "1.25",
        whiteSpace: settings.wordWrap ? "pre-wrap" : "pre",
        overflowWrap: settings.wordWrap ? "break-word" : "normal",
        boxSizing: "border-box",
      }}
    />
  );
}