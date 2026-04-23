import {
  ClipboardPaste,
  Copy,
  Pencil,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Settings2,
  Trash2,
  FlipHorizontal2,
  FlipVertical2,
} from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/ContextMenu";
import type { MapCanvasContextMenuContentProps } from "@/features/map-editor/types/map-panel-context-menu";

export function MapCanvasContextMenuContent({
  canCopy,
  canCut,
  canDeleteSelection,
  canPaste,
  canEditInImageEditor,
  canOrientContextMenu,
  hasContextMenuObject,
  onCopy,
  onCut,
  onDelete,
  onPaste,
  onEditInImageEditor,
  onEditObjectProperties,
  onOrientSelection,
}: MapCanvasContextMenuContentProps) {
  return (
    <ContextMenuContent>
      <ContextMenuItem disabled={!canCopy} onSelect={onCopy}>
        <Copy className="h-3.5 w-3.5" />
        Copy
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!canCut} onSelect={onCut}>
        <Scissors className="h-3.5 w-3.5" />
        Cut
        <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!canDeleteSelection} onSelect={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canPaste} onSelect={onPaste}>
        <ClipboardPaste className="h-3.5 w-3.5" />
        Paste
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!canEditInImageEditor}
        onSelect={onEditInImageEditor}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit in Image Editor
      </ContextMenuItem>
      {hasContextMenuObject && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onEditObjectProperties}>
            <Settings2 className="h-3.5 w-3.5" />
            Edit Properties
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!canOrientContextMenu}>
          <RefreshCw className="h-3.5 w-3.5" />
          Orientation
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => onOrientSelection("rotateLeft")}>
            <RotateCcw className="h-3.5 w-3.5" />
            Rotate Left 90°
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOrientSelection("rotateRight")}>
            <RotateCw className="h-3.5 w-3.5" />
            Rotate Right 90°
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOrientSelection("flipH")}>
            <FlipHorizontal2 className="h-3.5 w-3.5" />
            Flip Horizontal
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOrientSelection("flipV")}>
            <FlipVertical2 className="h-3.5 w-3.5" />
            Flip Vertical
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  );
}
