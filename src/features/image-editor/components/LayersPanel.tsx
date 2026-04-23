/**
 * Layers panel for the pixel-art Image / Sprite Editor.
 *
 * Mirrors the structure of the map-editor LayersPanel but wired to the
 * image-editor store instead of the main editor store.
 * Re-uses the existing LayerRow and GroupRow presentational components.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { AddLayerDialog } from "@/features/map-editor/dialogs/AddLayerDialog";
import { useImageEditor } from "@/features/image-editor/hooks/use-image-editor";
import {
  buildImageEditorDisplayTree,
  isImageEditorAncestorOf,
} from "@/features/map-editor/lib/layers";
import { LayerRow } from "@/features/map-editor/components/LayersPanel/LayerRow";
import { GroupRow } from "@/features/map-editor/components/LayersPanel/GroupRow";

export function ImageEditorLayersPanel() {
  const editor = useImageEditor();
  const state = editor.state;

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    isGroup: boolean;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ---- Drag & Drop state ----
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragIsGroup, setDragIsGroup] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: string;
    position: "above" | "below" | "inside";
  } | null>(null);

  if (!state) return null;

  const layers = state.layers ?? [];
  const imageLayers = state.imageLayers ?? [];
  const layerGroups = state.layerGroups ?? [];
  const layerOrder = state.layerOrder ?? [];

  const treeNodes = buildImageEditorDisplayTree(
    layerOrder,
    layers,
    imageLayers,
    layerGroups,
  );

  const totalItems = layers.length + imageLayers.length;

  // -------------------------------------------------------------------------
  // Drag & Drop
  // -------------------------------------------------------------------------

  function handleDragStart(id: string, isGroup: boolean) {
    setDragId(id);
    setDragIsGroup(isGroup);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragIsGroup(false);
    setDropIndicator(null);
  }

  function handleDragOverRow(
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || dragId === targetId) {
      setDropIndicator(null);
      return;
    }

    // Prevent dropping a group into itself or its descendants
    if (dragIsGroup) {
      if (isImageEditorAncestorOf(dragId, targetId, layerGroups)) {
        setDropIndicator(null);
        return;
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;

    let position: "above" | "below" | "inside";
    if (targetIsGroup) {
      if (ratio < 0.25) position = "above";
      else if (ratio > 0.75) position = "below";
      else position = "inside";
    } else {
      position = ratio < 0.5 ? "above" : "below";
    }

    setDropIndicator({ targetId, position });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId || !dropIndicator) {
      handleDragEnd();
      return;
    }
    editor.moveImageEditorLayerIntoOrder(
      dragId,
      dropIndicator.targetId,
      dropIndicator.position,
    );
    handleDragEnd();
  }

  // -------------------------------------------------------------------------
  // Create layer
  // -------------------------------------------------------------------------

  function handleCreateLayer(
    name: string,
    type: "tile" | "group" | "image" | "object",
  ) {
    if (type === "group") {
      editor.addImageEditorLayerGroup(name);
    } else if (type === "image") {
      editor.addImageEditorImageLayer(name);
    } else {
      editor.addRasterLayer(name);
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.isGroup) {
      editor.deleteImageEditorGroup(deleteTarget.id);
    } else {
      editor.deleteImageEditorLayer(deleteTarget.id);
    }
    setDeleteTarget(null);
  }

  // -------------------------------------------------------------------------
  // Rename
  // -------------------------------------------------------------------------

  function handleDoubleClick(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) {
      editor.renameImageEditorLayer(renamingId, name);
    }
    setRenamingId(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-b border-border bg-card shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Layers
        </span>
        <Button
          variant="default"
          size="sm"
          className="h-5 px-2 text-[10px]"
          onMouseDown={() => setAddLayerOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Add Layer
        </Button>
      </div>

      {/* Layer tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1 space-y-0.5">
          {treeNodes.map((node) => {
            if (node.type === "group") {
              return (
                <GroupRow
                  key={node.group.id}
                  group={node.group}
                  depth={node.depth}
                  parentGroupId={node.parentGroupId}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onDoubleClick={handleDoubleClick}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenamingId(null)}
                  onToggleExpand={editor.toggleImageEditorGroupExpanded}
                  onToggleVisibility={editor.toggleImageEditorLayerVisible}
                  onToggleLock={editor.toggleImageEditorLayerLocked}
                  onMove={editor.moveImageEditorLayerItem}
                  onDelete={(id, name) =>
                    setDeleteTarget({ id, name, isGroup: true })
                  }
                  onDuplicate={editor.duplicateImageEditorGroup}
                  isDragging={dragId === node.group.id}
                  dropIndicator={
                    dropIndicator && dropIndicator.targetId === node.group.id
                      ? dropIndicator.position
                      : null
                  }
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOverRow}
                  onDrop={handleDrop}
                />
              );
            }

            const layer = node.layer;
            return (
              <LayerRow
                key={layer.id}
                layer={layer}
                depth={node.depth}
                parentGroupId={node.parentGroupId}
                isActive={layer.id === state.activeLayerId}
                renamingId={renamingId}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onDoubleClick={handleDoubleClick}
                onCommitRename={commitRename}
                onCancelRename={() => setRenamingId(null)}
                onSelect={editor.setActiveImageEditorLayer}
                onToggleVisibility={editor.toggleImageEditorLayerVisible}
                onToggleLock={editor.toggleImageEditorLayerLocked}
                onMove={editor.moveImageEditorLayerItem}
                onDelete={(id, name) =>
                  setDeleteTarget({ id, name, isGroup: false })
                }
                onDuplicate={editor.duplicateImageEditorLayer}
                isDragging={dragId === layer.id}
                dropIndicator={
                  dropIndicator && dropIndicator.targetId === layer.id
                    ? dropIndicator.position
                    : null
                }
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOverRow}
                onDrop={handleDrop}
              />
            );
          })}
        </div>
      </ScrollArea>

      {/* Add layer dialog — no object layers for the image editor */}
      <AddLayerDialog
        open={addLayerOpen}
        onOpenChange={setAddLayerOpen}
        defaultName={`Layer ${totalItems + 1}`}
        onCreateLayer={handleCreateLayer}
        allowedTypes={["tile", "image", "group"]}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.isGroup ? "layer group" : "layer"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;
              {deleteTarget?.isGroup && " and all layers inside it"}. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
