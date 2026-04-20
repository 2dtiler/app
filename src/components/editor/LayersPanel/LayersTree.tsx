import { GroupRow } from "./GroupRow";
import { LayerRow } from "./LayerRow";
import type { LayersTreeProps } from "@/types/layers-panel";

export function LayersTree({
  treeNodes,
  activeLayerId,
  renamingId,
  renameValue,
  dragId,
  dropIndicator,
  onRenameValueChange,
  onDoubleClick,
  onCommitRename,
  onCancelRename,
  onSelectLayer,
  onToggleExpand,
  onToggleVisibility,
  onToggleLock,
  onMoveItem,
  onDeleteTarget,
  onDuplicateLayer,
  onDuplicateGroup,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDrop,
}: LayersTreeProps) {
  return (
    <div className="px-2 pb-4">
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
              onRenameValueChange={onRenameValueChange}
              onDoubleClick={onDoubleClick}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onMove={onMoveItem}
              onDelete={(id, name) =>
                onDeleteTarget({ id, name, isGroup: true })
              }
              onDuplicate={onDuplicateGroup}
              isDragging={dragId === node.group.id}
              dropIndicator={
                dropIndicator?.targetId === node.group.id
                  ? dropIndicator.position
                  : null
              }
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOverRow}
              onDrop={onDrop}
            />
          );
        }

        return (
          <LayerRow
            key={node.layer.id}
            layer={node.layer}
            depth={node.depth}
            parentGroupId={node.parentGroupId}
            isActive={node.layer.id === activeLayerId}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameValueChange={onRenameValueChange}
            onDoubleClick={onDoubleClick}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onSelect={onSelectLayer}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onMove={onMoveItem}
            onDelete={(id, name) => onDeleteTarget({ id, name, isGroup: false })}
            onDuplicate={onDuplicateLayer}
            isDragging={dragId === node.layer.id}
            dropIndicator={
              dropIndicator?.targetId === node.layer.id
                ? dropIndicator.position
                : null
            }
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOverRow}
            onDrop={onDrop}
          />
        );
      })}
    </div>
  );
}