import type { DragEvent } from "react";
import type { LayerTreeNode } from "@/types/editor-helpers";

export type LayerDropPosition = "above" | "below" | "inside";

export interface LayerDropIndicator {
  targetId: string;
  position: LayerDropPosition;
}

export interface LayersPanelDeleteTarget {
  id: string;
  name: string;
  isGroup: boolean;
}

export interface LayersTreeProps {
  treeNodes: LayerTreeNode[];
  activeLayerId: string | null;
  renamingId: string | null;
  renameValue: string;
  dragId: string | null;
  dropIndicator: LayerDropIndicator | null;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelectLayer: (layerId: string) => void;
  onToggleExpand: (groupId: string) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onMoveItem: (
    id: string,
    direction: "up" | "down",
    parentGroupId: string | null,
  ) => void;
  onDeleteTarget: (target: LayersPanelDeleteTarget) => void;
  onDuplicateLayer: (layerId: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOverRow: (
    event: DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (event: DragEvent) => void;
}

export interface DeleteLayerDialogProps {
  deleteTarget: LayersPanelDeleteTarget | null;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}
