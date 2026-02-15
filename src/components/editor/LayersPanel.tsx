import { useState, useRef, memo, useCallback } from "react";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Folder,
  FolderOpen,
  GripVertical,
  TextCursorInput,
  Grid3X3,
  Image,
  Shapes,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AddLayerDialog } from "@/components/dialogs/AddLayerDialog";
import { useEditorStore } from "@/hooks/use-editor-store";
import {
  generateLayerId,
  generateLayerGroupId,
  generateAssetId,
  generateObjectId,
} from "@/lib/ids";
import { saveAsset } from "@/lib/db";
import {
  buildDisplayTree,
  findLastLayerId,
  getAllLayerIds,
  getAllGroupIds,
  isAncestorOf,
} from "@/lib/layers";
import type {
  LayerId,
  LayerGroupId,
  TileLayer,
  ImageLayer,
  ObjectLayer,
  LayerGroup,
  LayerType,
  MapObject,
} from "@/types";
import { cn } from "@/lib/utils";

export function LayersPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;

  const [addLayerOpen, setAddLayerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    isGroup: boolean;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ---- Hidden file input for image layer ----
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ---- Drag & Drop state ----
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragIsGroup, setDragIsGroup] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: string;
    position: "above" | "below" | "inside";
  } | null>(null);

  if (!project) return null;

  const activeMap = project.maps.find((m) => m.id === state.activeMapId);
  const layerGroups = project.layerGroups ?? [];

  if (!activeMap) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-1 border-b border-border bg-card shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Layers
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
          No map selected
        </div>
      </div>
    );
  }

  // Build display tree (top-to-bottom for rendering)
  const imageLayers = project.imageLayers ?? [];
  const objectLayers = project.objectLayers ?? [];
  const treeNodes = buildDisplayTree(
    activeMap.layerOrder,
    project.layers,
    layerGroups,
    0,
    null,
    imageLayers,
    objectLayers,
  );

  // Count total layers (including nested) for default name
  const totalItems = getAllLayerIds(activeMap.layerOrder, layerGroups).length;

  // -------------------------------------------------------------------------
  // Drag & Drop handlers
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

    // Prevent dropping a group into itself or one of its descendants
    if (dragIsGroup && targetIsGroup) {
      if (isAncestorOf(dragId, targetId, layerGroups)) {
        setDropIndicator(null);
        return;
      }
    }
    if (dragIsGroup) {
      // Check if the target is a child of the dragged group
      if (isAncestorOf(dragId, targetId, layerGroups)) {
        setDropIndicator(null);
        return;
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;

    let position: "above" | "below" | "inside";
    if (targetIsGroup) {
      // Groups have three zones: top 25% = above, middle 50% = inside, bottom 25% = below
      if (ratio < 0.25) position = "above";
      else if (ratio > 0.75) position = "below";
      else position = "inside";
    } else {
      // Layers have two zones: top 50% = above, bottom 50% = below
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

    const { targetId, position } = dropIndicator;

    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      const groups = draft.project.layerGroups ?? [];

      // --- 1. Remove the dragged item from its current location ---
      const removeFromOrder = (order: (LayerId | LayerGroupId)[]) => {
        const idx = (order as string[]).indexOf(dragId);
        if (idx !== -1) order.splice(idx, 1);
      };

      // Remove from top-level
      removeFromOrder(map.layerOrder);
      // Remove from all groups
      for (const g of groups) {
        removeFromOrder(g.childOrder);
      }

      // --- 2. Insert at the target location ---
      if (position === "inside") {
        // Drop into a group
        const targetGroup = groups.find((g) => g.id === targetId);
        if (targetGroup) {
          // Add to the top of the group (end of childOrder = visually top)
          targetGroup.childOrder.push(dragId as LayerId | LayerGroupId);
          // Auto-expand the group so user can see the dropped item
          targetGroup.expanded = true;
        }
      } else {
        // "above" or "below" — insert relative to the target
        // Find which array the target is in
        let targetOrder: (LayerId | LayerGroupId)[] | null = null;

        if ((map.layerOrder as string[]).includes(targetId)) {
          targetOrder = map.layerOrder;
        } else {
          for (const g of groups) {
            if ((g.childOrder as string[]).includes(targetId)) {
              targetOrder = g.childOrder;
              break;
            }
          }
        }

        if (targetOrder) {
          const targetIdx = (targetOrder as string[]).indexOf(targetId);
          if (targetIdx !== -1) {
            // Display is reversed: "above" in display = higher index in data,
            // "below" in display = lower index in data
            const insertIdx = position === "above" ? targetIdx + 1 : targetIdx;
            targetOrder.splice(insertIdx, 0, dragId as LayerId | LayerGroupId);
          }
        }
      }
    });

    handleDragEnd();
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleAddLayer() {
    setAddLayerOpen(true);
  }

  function handleCreateLayer(
    name: string,
    type: "tile" | "group" | "image" | "object",
  ) {
    if (type === "group") {
      handleCreateGroup(name);
      return;
    }

    if (type === "object") {
      handleCreateObjectLayer(name);
      return;
    }

    const layerId = generateLayerId();
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;

      const layer: TileLayer = {
        id: layerId,
        mapId: map.id,
        name,
        type: type as LayerType,
        visible: true,
        locked: false,
        tiles: {},
      };
      draft.project.layers.push(layer);

      // If active layer is inside a group, add to that group
      const groups = draft.project.layerGroups ?? [];
      if (state.activeLayerId) {
        const parentGroup = groups.find((g) =>
          (g.childOrder as string[]).includes(state.activeLayerId as string),
        );
        if (parentGroup) {
          const idx = (parentGroup.childOrder as string[]).indexOf(
            state.activeLayerId as string,
          );
          parentGroup.childOrder.splice(idx + 1, 0, layerId);
        } else {
          map.layerOrder.push(layerId);
        }
      } else {
        map.layerOrder.push(layerId);
      }

      draft.activeLayerId = layerId;
    });
  }

  function handleCreateGroup(name: string) {
    const groupId = generateLayerGroupId();
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;

      if (!draft.project.layerGroups) draft.project.layerGroups = [];

      const group: LayerGroup = {
        id: groupId,
        mapId: map.id,
        name,
        visible: true,
        locked: false,
        expanded: true,
        childOrder: [],
      };
      draft.project.layerGroups.push(group);
      map.layerOrder.push(groupId);
    });
  }

  function handleCreateObjectLayer(name: string) {
    const layerId = generateLayerId();
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;

      if (!draft.project.objectLayers) draft.project.objectLayers = [];
      if (!draft.project.objects) draft.project.objects = [];

      const objectLayer: ObjectLayer = {
        id: layerId,
        mapId: map.id,
        name,
        type: "object",
        visible: true,
        locked: false,
        objectOrder: [],
      };
      draft.project.objectLayers.push(objectLayer);

      // Add to layer order
      const groups = draft.project.layerGroups ?? [];
      if (state.activeLayerId) {
        const parentGroup = groups.find((g) =>
          (g.childOrder as string[]).includes(state.activeLayerId as string),
        );
        if (parentGroup) {
          const idx = (parentGroup.childOrder as string[]).indexOf(
            state.activeLayerId as string,
          );
          parentGroup.childOrder.splice(idx + 1, 0, layerId);
        } else {
          map.layerOrder.push(layerId);
        }
      } else {
        map.layerOrder.push(layerId);
      }

      draft.activeLayerId = layerId;
      draft.currentTool = "select";
    });
  }

  function handleRequestImageLayer() {
    // Trigger the hidden file input
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
      imageInputRef.current.click();
    }
  }

  async function handleImageFileSelected(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_IMAGE_SIZE) {
      alert(
        `Image must be under 5 MB. The selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
      );
      e.target.value = "";
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const assetId = generateAssetId();
      await saveAsset(assetId, arrayBuffer, file.type);

      // Load image to get natural dimensions
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.src = url;
      await img.decode();
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      URL.revokeObjectURL(url);

      const layerId = generateLayerId();
      const layerName = file.name.replace(/\.[^.]+$/, "") || "Image Layer";

      setState((draft) => {
        if (!draft.project) return;
        const map = draft.project.maps.find((m) => m.id === state.activeMapId);
        if (!map) return;

        if (!draft.project.imageLayers) draft.project.imageLayers = [];

        const imageLayer: ImageLayer = {
          id: layerId,
          mapId: map.id,
          name: layerName,
          type: "image",
          visible: true,
          locked: false,
          assetId,
          x: 0,
          y: 0,
          width: imgWidth,
          height: imgHeight,
        };
        draft.project.imageLayers.push(imageLayer);

        // Add to layer order
        const groups = draft.project.layerGroups ?? [];
        if (state.activeLayerId) {
          const parentGroup = groups.find((g) =>
            (g.childOrder as string[]).includes(state.activeLayerId as string),
          );
          if (parentGroup) {
            const idx = (parentGroup.childOrder as string[]).indexOf(
              state.activeLayerId as string,
            );
            parentGroup.childOrder.splice(idx + 1, 0, layerId);
          } else {
            map.layerOrder.push(layerId);
          }
        } else {
          map.layerOrder.push(layerId);
        }

        // Set active and switch to select tool
        draft.activeLayerId = layerId;
        draft.currentTool = "select";
      });
    } catch {
      // Silently fail on invalid image
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;

    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      const groups = draft.project.layerGroups ?? [];

      if (deleteTarget.isGroup) {
        const group = groups.find((g) => g.id === deleteTarget.id);
        if (!group) return;

        // Collect all nested layer IDs and group IDs
        const childLayerIds = getAllLayerIds(group.childOrder, groups);
        const childGroupIds = getAllGroupIds(group.childOrder, groups);
        childGroupIds.push(group.id as LayerGroupId);

        // Remove all child layers (tile, image, and object)
        draft.project.layers = draft.project.layers.filter(
          (l) => !childLayerIds.includes(l.id),
        );
        if (draft.project.imageLayers) {
          draft.project.imageLayers = draft.project.imageLayers.filter(
            (l) => !childLayerIds.includes(l.id),
          );
        }
        if (draft.project.objectLayers) {
          draft.project.objectLayers = draft.project.objectLayers.filter(
            (l) => !childLayerIds.includes(l.id),
          );
          // Remove objects belonging to deleted object layers
          if (draft.project.objects) {
            draft.project.objects = draft.project.objects.filter(
              (o) => !childLayerIds.includes(o.layerId),
            );
          }
        }

        // Remove all child groups + the group itself
        draft.project.layerGroups = groups.filter(
          (g) => !(childGroupIds as string[]).includes(g.id as string),
        );

        // Remove from top-level order
        map.layerOrder = map.layerOrder.filter(
          (id) => id !== deleteTarget.id,
        ) as typeof map.layerOrder;

        // Also remove from any parent group's childOrder
        for (const g of draft.project.layerGroups ?? []) {
          g.childOrder = g.childOrder.filter(
            (id) => id !== deleteTarget.id,
          ) as typeof g.childOrder;
        }

        // Update active layer if it was in the deleted group
        if (childLayerIds.includes(draft.activeLayerId as LayerId)) {
          draft.activeLayerId =
            findLastLayerId(
              map.layerOrder,
              draft.project.layers,
              draft.project.layerGroups ?? [],
            ) ?? null;
        }
      } else {
        // Delete a single layer
        map.layerOrder = map.layerOrder.filter(
          (id) => id !== deleteTarget.id,
        ) as typeof map.layerOrder;

        // Remove from any group's childOrder
        for (const g of groups) {
          g.childOrder = g.childOrder.filter(
            (id) => id !== deleteTarget.id,
          ) as typeof g.childOrder;
        }

        draft.project.layers = draft.project.layers.filter(
          (l) => l.id !== deleteTarget.id,
        );
        if (draft.project.imageLayers) {
          draft.project.imageLayers = draft.project.imageLayers.filter(
            (l) => l.id !== deleteTarget.id,
          );
        }
        if (draft.project.objectLayers) {
          draft.project.objectLayers = draft.project.objectLayers.filter(
            (l) => l.id !== deleteTarget.id,
          );
          // Remove objects belonging to deleted object layer
          if (draft.project.objects) {
            draft.project.objects = draft.project.objects.filter(
              (o) => o.layerId !== deleteTarget.id,
            );
          }
        }

        if (draft.activeLayerId === deleteTarget.id) {
          draft.activeLayerId =
            findLastLayerId(
              map.layerOrder,
              draft.project.layers,
              draft.project.layerGroups ?? [],
            ) ?? null;
        }
      }
    });
    setDeleteTarget(null);
  }

  function handleToggleVisibility(id: string, isGroup: boolean) {
    setState((draft) => {
      if (isGroup) {
        const group = (draft.project?.layerGroups ?? []).find(
          (g) => g.id === id,
        );
        if (group) group.visible = !group.visible;
      } else {
        const layer = draft.project?.layers.find((l) => l.id === id);
        if (layer) {
          layer.visible = !layer.visible;
        } else {
          const imgLayer = (draft.project?.imageLayers ?? []).find(
            (l) => l.id === id,
          );
          if (imgLayer) {
            imgLayer.visible = !imgLayer.visible;
          } else {
            const objLayer = (draft.project?.objectLayers ?? []).find(
              (l) => l.id === id,
            );
            if (objLayer) objLayer.visible = !objLayer.visible;
          }
        }
      }
    });
  }

  function handleToggleLock(id: string, isGroup: boolean) {
    setState((draft) => {
      if (isGroup) {
        const group = (draft.project?.layerGroups ?? []).find(
          (g) => g.id === id,
        );
        if (group) group.locked = !group.locked;
      } else {
        const layer = draft.project?.layers.find((l) => l.id === id);
        if (layer) {
          layer.locked = !layer.locked;
        } else {
          const imgLayer = (draft.project?.imageLayers ?? []).find(
            (l) => l.id === id,
          );
          if (imgLayer) {
            imgLayer.locked = !imgLayer.locked;
          } else {
            const objLayer = (draft.project?.objectLayers ?? []).find(
              (l) => l.id === id,
            );
            if (objLayer) objLayer.locked = !objLayer.locked;
          }
        }
      }
    });
  }

  function handleToggleExpand(groupId: LayerGroupId) {
    setState((draft) => {
      const group = (draft.project?.layerGroups ?? []).find(
        (g) => g.id === groupId,
      );
      if (group) group.expanded = !group.expanded;
    });
  }

  function handleMoveItem(
    id: string,
    direction: "up" | "down",
    parentGroupId: LayerGroupId | null,
  ) {
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;

      // Find the array this item belongs to
      let order: (LayerId | LayerGroupId)[];
      if (parentGroupId) {
        const parentGroup = (draft.project.layerGroups ?? []).find(
          (g) => g.id === parentGroupId,
        );
        if (!parentGroup) return;
        order = parentGroup.childOrder;
      } else {
        order = map.layerOrder;
      }

      const idx = (order as string[]).indexOf(id);
      if (idx === -1) return;

      // "up" in visual = higher index in layerOrder (closer to top of render)
      const targetIdx = direction === "up" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= order.length) return;

      const temp = order[idx];
      order[idx] = order[targetIdx];
      order[targetIdx] = temp;
    });
  }

  function handleSelectLayer(layerId: LayerId) {
    setState((draft) => {
      draft.activeLayerId = layerId;
    });
  }

  function handleDuplicateLayer(layerId: string) {
    const newLayerId = generateLayerId();
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      const groups = draft.project.layerGroups ?? [];

      // Try tile layer
      const tileLayer = draft.project.layers.find((l) => l.id === layerId);
      if (tileLayer) {
        const copy: TileLayer = {
          id: newLayerId,
          mapId: tileLayer.mapId,
          name: `${tileLayer.name} copy`,
          type: tileLayer.type,
          visible: tileLayer.visible,
          locked: tileLayer.locked,
          tiles: { ...tileLayer.tiles },
        };
        draft.project.layers.push(copy);
        insertAfter(layerId, newLayerId, map.layerOrder, groups);
        draft.activeLayerId = newLayerId;
        return;
      }

      // Try image layer
      const imgLayer = (draft.project.imageLayers ?? []).find(
        (l) => l.id === layerId,
      );
      if (imgLayer) {
        const copy: ImageLayer = {
          id: newLayerId,
          mapId: imgLayer.mapId,
          name: `${imgLayer.name} copy`,
          type: "image",
          visible: imgLayer.visible,
          locked: imgLayer.locked,
          assetId: imgLayer.assetId,
          x: imgLayer.x,
          y: imgLayer.y,
          width: imgLayer.width,
          height: imgLayer.height,
        };
        draft.project.imageLayers.push(copy);
        insertAfter(layerId, newLayerId, map.layerOrder, groups);
        draft.activeLayerId = newLayerId;
        return;
      }

      // Try object layer
      const objLayer = (draft.project.objectLayers ?? []).find(
        (l) => l.id === layerId,
      );
      if (objLayer) {
        // Map old object IDs to new ones
        const objectIdMap = new Map<string, string>();
        for (const oid of objLayer.objectOrder) {
          objectIdMap.set(oid as string, generateObjectId() as string);
        }

        const copy: ObjectLayer = {
          id: newLayerId,
          mapId: objLayer.mapId,
          name: `${objLayer.name} copy`,
          type: "object",
          visible: objLayer.visible,
          locked: objLayer.locked,
          objectOrder: objLayer.objectOrder.map(
            (oid) => (objectIdMap.get(oid as string) ?? oid) as typeof oid,
          ),
        };
        draft.project.objectLayers.push(copy);

        // Duplicate the objects themselves
        if (draft.project.objects) {
          for (const obj of [...draft.project.objects]) {
            if (obj.layerId !== layerId) continue;
            const newObjId = objectIdMap.get(obj.id as string);
            if (!newObjId) continue;
            const objCopy: MapObject = {
              ...obj,
              id: newObjId as typeof obj.id,
              layerId: newLayerId,
              name: obj.name,
              points: obj.points.map((p) => ({ ...p })),
              properties: { ...obj.properties },
            };
            draft.project.objects.push(objCopy);
          }
        }

        insertAfter(layerId, newLayerId, map.layerOrder, groups);
        draft.activeLayerId = newLayerId;
      }
    });
  }

  function handleDuplicateGroup(groupId: string) {
    setState((draft) => {
      if (!draft.project) return;
      const map = draft.project.maps.find((m) => m.id === state.activeMapId);
      if (!map) return;
      const groups = draft.project.layerGroups ?? [];
      const srcGroup = groups.find((g) => g.id === groupId);
      if (!srcGroup) return;

      // Collect all nested layer IDs and group IDs to duplicate
      const childLayerIds = getAllLayerIds(srcGroup.childOrder, groups);
      const childGroupIds = getAllGroupIds(srcGroup.childOrder, groups);

      // Build ID maps
      const layerIdMap = new Map<string, LayerId>();
      const groupIdMap = new Map<string, LayerGroupId>();
      for (const id of childLayerIds) layerIdMap.set(id as string, generateLayerId());
      for (const id of childGroupIds) groupIdMap.set(id as string, generateLayerGroupId());

      const newGroupId = generateLayerGroupId();
      groupIdMap.set(groupId, newGroupId);

      const remapId = (id: LayerId | LayerGroupId): LayerId | LayerGroupId =>
        (layerIdMap.get(id as string) ?? groupIdMap.get(id as string) ?? id) as
          | LayerId
          | LayerGroupId;

      // Duplicate the group itself
      const newGroup: LayerGroup = {
        id: newGroupId,
        mapId: srcGroup.mapId,
        name: `${srcGroup.name} copy`,
        visible: srcGroup.visible,
        locked: srcGroup.locked,
        expanded: srcGroup.expanded,
        childOrder: srcGroup.childOrder.map(remapId),
      };
      draft.project.layerGroups.push(newGroup);

      // Duplicate nested groups
      for (const gid of childGroupIds) {
        const g = groups.find((gr) => gr.id === gid);
        if (!g) continue;
        const newGId = groupIdMap.get(gid as string)!;
        const gCopy: LayerGroup = {
          id: newGId,
          mapId: g.mapId,
          name: g.name,
          visible: g.visible,
          locked: g.locked,
          expanded: g.expanded,
          childOrder: g.childOrder.map(remapId),
        };
        draft.project.layerGroups.push(gCopy);
      }

      // Duplicate nested tile layers
      for (const lid of childLayerIds) {
        const tl = draft.project.layers.find((l) => l.id === lid);
        if (tl) {
          const newId = layerIdMap.get(lid as string)!;
          const copy: TileLayer = {
            id: newId,
            mapId: tl.mapId,
            name: tl.name,
            type: tl.type,
            visible: tl.visible,
            locked: tl.locked,
            tiles: { ...tl.tiles },
          };
          draft.project.layers.push(copy);
          continue;
        }

        const il = (draft.project.imageLayers ?? []).find((l) => l.id === lid);
        if (il) {
          const newId = layerIdMap.get(lid as string)!;
          const copy: ImageLayer = {
            id: newId,
            mapId: il.mapId,
            name: il.name,
            type: "image",
            visible: il.visible,
            locked: il.locked,
            assetId: il.assetId,
            x: il.x,
            y: il.y,
            width: il.width,
            height: il.height,
          };
          draft.project.imageLayers.push(copy);
          continue;
        }

        const ol = (draft.project.objectLayers ?? []).find((l) => l.id === lid);
        if (ol) {
          const newId = layerIdMap.get(lid as string)!;
          // Map old object IDs to new ones
          const objectIdMap = new Map<string, string>();
          for (const oid of ol.objectOrder) {
            objectIdMap.set(oid as string, generateObjectId() as string);
          }

          const copy: ObjectLayer = {
            id: newId,
            mapId: ol.mapId,
            name: ol.name,
            type: "object",
            visible: ol.visible,
            locked: ol.locked,
            objectOrder: ol.objectOrder.map(
              (oid) => (objectIdMap.get(oid as string) ?? oid) as typeof oid,
            ),
          };
          draft.project.objectLayers.push(copy);

          // Duplicate objects belonging to this layer
          if (draft.project.objects) {
            for (const obj of [...draft.project.objects]) {
              if (obj.layerId !== lid) continue;
              const newObjId = objectIdMap.get(obj.id as string);
              if (!newObjId) continue;
              const objCopy: MapObject = {
                ...obj,
                id: newObjId as typeof obj.id,
                layerId: newId,
                name: obj.name,
                points: obj.points.map((p) => ({ ...p })),
                properties: { ...obj.properties },
              };
              draft.project.objects.push(objCopy);
            }
          }
        }
      }

      // Insert the new group after the source group in the layer order
      insertAfter(groupId, newGroupId as string, map.layerOrder, groups);
    });
  }

  /** Insert newId right after refId in whichever order array contains refId. */
  function insertAfter(
    refId: string,
    newId: string,
    topOrder: (LayerId | LayerGroupId)[],
    groups: LayerGroup[],
  ) {
    const topIdx = (topOrder as string[]).indexOf(refId);
    if (topIdx !== -1) {
      topOrder.splice(topIdx + 1, 0, newId as LayerId | LayerGroupId);
      return;
    }
    for (const g of groups) {
      const idx = (g.childOrder as string[]).indexOf(refId);
      if (idx !== -1) {
        g.childOrder.splice(idx + 1, 0, newId as LayerId | LayerGroupId);
        return;
      }
    }
  }

  function handleDoubleClick(id: string, name: string) {
    setRenamingId(id);
    setRenameValue(name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) {
      setState((draft) => {
        // Try tile layer first
        const layer = draft.project?.layers.find((l) => l.id === renamingId);
        if (layer) {
          layer.name = name;
          return;
        }
        // Try image layer
        const imgLayer = (draft.project?.imageLayers ?? []).find(
          (l) => l.id === renamingId,
        );
        if (imgLayer) {
          imgLayer.name = name;
          return;
        }
        // Try object layer
        const objLayer = (draft.project?.objectLayers ?? []).find(
          (l) => l.id === renamingId,
        );
        if (objLayer) {
          objLayer.name = name;
          return;
        }
        // Try group
        const group = (draft.project?.layerGroups ?? []).find(
          (g) => g.id === renamingId,
        );
        if (group) {
          group.name = name;
        }
      });
    }
    setRenamingId(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Layers
        </span>
        <Button
          variant="default"
          size="sm"
          className="h-5 px-2 text-[10px]"
          onMouseDown={handleAddLayer}
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
                  onToggleExpand={handleToggleExpand}
                  onToggleVisibility={handleToggleVisibility}
                  onToggleLock={handleToggleLock}
                  onMove={handleMoveItem}
                  onDelete={(id, name) =>
                    setDeleteTarget({ id, name, isGroup: true })
                  }
                  onDuplicate={handleDuplicateGroup}
                  isDragging={dragId === node.group.id}
                  dropIndicator={
                    dropIndicator?.targetId === node.group.id
                      ? dropIndicator.position
                      : null
                  }
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOverRow}
                  onDrop={handleDrop}
                />
              );
            } else if (
              node.type === "imageLayer" ||
              node.type === "objectLayer"
            ) {
              return (
                <LayerRow
                  key={node.layer.id}
                  layer={node.layer}
                  depth={node.depth}
                  parentGroupId={node.parentGroupId}
                  isActive={node.layer.id === state.activeLayerId}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onDoubleClick={handleDoubleClick}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenamingId(null)}
                  onSelect={handleSelectLayer}
                  onToggleVisibility={handleToggleVisibility}
                  onToggleLock={handleToggleLock}
                  onMove={handleMoveItem}
                  onDelete={(id, name) =>
                    setDeleteTarget({ id, name, isGroup: false })
                  }
                  onDuplicate={handleDuplicateLayer}
                  isDragging={dragId === node.layer.id}
                  dropIndicator={
                    dropIndicator?.targetId === node.layer.id
                      ? dropIndicator.position
                      : null
                  }
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOverRow}
                  onDrop={handleDrop}
                />
              );
            } else {
              return (
                <LayerRow
                  key={node.layer.id}
                  layer={node.layer}
                  depth={node.depth}
                  parentGroupId={node.parentGroupId}
                  isActive={node.layer.id === state.activeLayerId}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={setRenameValue}
                  onDoubleClick={handleDoubleClick}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenamingId(null)}
                  onSelect={handleSelectLayer}
                  onToggleVisibility={handleToggleVisibility}
                  onToggleLock={handleToggleLock}
                  onMove={handleMoveItem}
                  onDelete={(id, name) =>
                    setDeleteTarget({ id, name, isGroup: false })
                  }
                  onDuplicate={handleDuplicateLayer}
                  isDragging={dragId === node.layer.id}
                  dropIndicator={
                    dropIndicator?.targetId === node.layer.id
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
          })}
        </div>
      </ScrollArea>

      {/* Add layer dialog */}
      <AddLayerDialog
        open={addLayerOpen}
        onOpenChange={setAddLayerOpen}
        defaultName={`Layer ${totalItems + 1}`}
        onCreateLayer={(name, type) => handleCreateLayer(name, type)}
        onRequestImageLayer={handleRequestImageLayer}
      />

      {/* Hidden file input for image layer */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileSelected}
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
            <AlertDialogAction onMouseDown={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupRow component
// ---------------------------------------------------------------------------

interface GroupRowProps {
  group: LayerGroup;
  depth: number;
  parentGroupId: LayerGroupId | null;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleExpand: (id: LayerGroupId) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onMove: (
    id: string,
    dir: "up" | "down",
    parentGroupId: LayerGroupId | null,
  ) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  // Drag & Drop
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (e: React.DragEvent) => void;
}

const GroupRow = memo(function GroupRow({
  group,
  depth,
  parentGroupId,
  renamingId,
  renameValue,
  onRenameValueChange,
  onDoubleClick,
  onCommitRename,
  onCancelRename,
  onToggleExpand,
  onToggleVisibility,
  onToggleLock,
  onMove,
  onDelete,
  onDuplicate,
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: GroupRowProps) {
  const isRenaming = renamingId === group.id;

  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      requestAnimationFrame(() => {
        node.focus();
        node.select();
      });
    }
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "layer-item relative flex items-center gap-1 px-1.5 py-1 rounded text-xs group/item cursor-pointer bg-muted/30 hover:bg-secondary",
            isDragging && "opacity-40",
            dropIndicator === "inside" &&
              "ring-2 ring-primary ring-inset bg-primary/10",
          )}
          style={{ paddingLeft: `${6 + depth * 16}px` }}
          onMouseDown={() => onToggleExpand(group.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", group.id);
            onDragStart(group.id, true);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, group.id, true)}
          onDrop={onDrop}
        >
          {/* Drop indicator lines */}
          {dropIndicator === "above" && (
            <div className="absolute left-1 right-1 top-0 -translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}
          {dropIndicator === "below" && (
            <div className="absolute left-1 right-1 bottom-0 translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}

          {/* Drag handle */}
          <span
            className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover/item:opacity-60 hover:opacity-100!"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </span>

          {/* Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(group.id, true);
                }}
              >
                {group.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.visible ? "Hide Group" : "Show Group"}
            </TooltipContent>
          </Tooltip>

          {/* Lock */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleLock(group.id, true);
                }}
              >
                {group.locked ? (
                  <Lock className="h-3 w-3 text-primary" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {group.locked ? "Unlock Group" : "Lock Group"}
            </TooltipContent>
          </Tooltip>

          {/* Folder icon */}
          <span className="shrink-0">
            {group.expanded ? (
              <FolderOpen className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Folder className="h-3 w-3 text-muted-foreground" />
            )}
          </span>

          {/* Name */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="flex-1 min-w-0 h-5 px-1 text-xs bg-background border border-primary rounded"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 truncate font-medium"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClick(group.id, group.name);
              }}
            >
              {group.name}
            </span>
          )}

          {/* Move/Delete buttons */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0 px-0.5 rounded-r bg-secondary opacity-0 group-hover/item:opacity-100 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(group.id, "up", parentGroupId);
                  }}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Up</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(group.id, "down", parentGroupId);
                  }}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Down</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onDelete(group.id, group.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Group</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onMouseDown={() => onToggleVisibility(group.id, true)}>
          {group.visible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" /> Hide Group
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" /> Show Group
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onToggleLock(group.id, true)}>
          {group.locked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Unlock Group
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Lock Group
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDoubleClick(group.id, group.name)}>
          Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(group.id)}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onMouseDown={() => onMove(group.id, "up", parentGroupId)}>
          <ChevronUp className="h-4 w-4 mr-2" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(group.id, "down", parentGroupId)}
        >
          <ChevronDown className="h-4 w-4 mr-2" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(group.id, group.name)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Group
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

// ---------------------------------------------------------------------------
// LayerRow component
// ---------------------------------------------------------------------------

interface LayerRowProps {
  layer: TileLayer | ImageLayer | ObjectLayer;
  depth: number;
  parentGroupId: LayerGroupId | null;
  isActive: boolean;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onDoubleClick: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelect: (id: LayerId) => void;
  onToggleVisibility: (id: string, isGroup: boolean) => void;
  onToggleLock: (id: string, isGroup: boolean) => void;
  onMove: (
    id: string,
    dir: "up" | "down",
    parentGroupId: LayerGroupId | null,
  ) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  // Drag & Drop
  isDragging: boolean;
  dropIndicator: "above" | "below" | "inside" | null;
  onDragStart: (id: string, isGroup: boolean) => void;
  onDragEnd: () => void;
  onDragOver: (
    e: React.DragEvent,
    targetId: string,
    targetIsGroup: boolean,
  ) => void;
  onDrop: (e: React.DragEvent) => void;
}

const LayerRow = memo(function LayerRow({
  layer,
  depth,
  parentGroupId,
  isActive,
  renamingId,
  renameValue,
  onRenameValueChange,
  onDoubleClick,
  onCommitRename,
  onCancelRename,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onMove,
  onDelete,
  onDuplicate,
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: LayerRowProps) {
  const isRenaming = renamingId === layer.id;

  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      requestAnimationFrame(() => {
        node.focus();
        node.select();
      });
    }
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "layer-item relative flex items-center gap-1 px-1.5 py-1 rounded text-xs group/item cursor-pointer",
            isActive
              ? "bg-accent text-accent-foreground"
              : "hover:bg-secondary",
            isDragging && "opacity-40",
          )}
          style={{ paddingLeft: `${6 + depth * 16}px` }}
          onMouseDown={() => onSelect(layer.id)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", layer.id);
            onDragStart(layer.id, false);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, layer.id, false)}
          onDrop={onDrop}
        >
          {/* Drop indicator lines */}
          {dropIndicator === "above" && (
            <div className="absolute left-1 right-1 top-0 -translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}
          {dropIndicator === "below" && (
            <div className="absolute left-1 right-1 bottom-0 translate-y-1/2 h-0.5 bg-primary rounded-full z-10 pointer-events-none" />
          )}

          {/* Drag handle */}
          <span
            className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover/item:opacity-60 hover:opacity-100!"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </span>
          {/* Visibility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(layer.id, false);
                }}
              >
                {layer.visible ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.visible ? "Hide" : "Show"}</TooltipContent>
          </Tooltip>

          {/* Lock */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onToggleLock(layer.id, false);
                }}
              >
                {layer.locked ? (
                  <Lock className="h-3 w-3 text-primary" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layer.locked ? "Unlock" : "Lock"}</TooltipContent>
          </Tooltip>

          {/* Layer type icon */}
          <span className="shrink-0">
            {layer.type === "image" ? (
              <Image className="h-3 w-3 text-muted-foreground" />
            ) : layer.type === "object" ? (
              <Shapes className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Grid3X3 className="h-3 w-3 text-muted-foreground" />
            )}
          </span>

          {/* Name */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="flex-1 min-w-0 h-5 px-1 text-xs bg-background border border-primary rounded"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 truncate"
              onDoubleClick={() => onDoubleClick(layer.id, layer.name)}
            >
              {layer.name}
            </span>
          )}

          {/* Move/Delete buttons */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0 px-0.5 rounded-r bg-secondary opacity-0 group-hover/item:opacity-100 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(layer.id, "up", parentGroupId);
                  }}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Up</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onMove(layer.id, "down", parentGroupId);
                  }}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move Down</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onDelete(layer.id, layer.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Layer</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onMouseDown={() => onToggleVisibility(layer.id, false)}>
          {layer.visible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" /> Hide Layer
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" /> Show Layer
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onToggleLock(layer.id, false)}>
          {layer.locked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Unlock Layer
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Lock Layer
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDoubleClick(layer.id, layer.name)}>
          <TextCursorInput className="h-4 w-4 mr-2" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onMouseDown={() => onDuplicate(layer.id)}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onMouseDown={() => onMove(layer.id, "up", parentGroupId)}>
          <ChevronUp className="h-4 w-4 mr-2" /> Move Up
        </ContextMenuItem>
        <ContextMenuItem
          onMouseDown={() => onMove(layer.id, "down", parentGroupId)}
        >
          <ChevronDown className="h-4 w-4 mr-2" /> Move Down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onMouseDown={() => onDelete(layer.id, layer.name)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete Layer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
