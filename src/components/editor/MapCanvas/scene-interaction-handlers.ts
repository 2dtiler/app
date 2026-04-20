import type { TileRef } from "@/types";
import type {
  SceneInteractionHandlerContext,
  ScenePointerDownEvent,
  ScenePointerPosition,
  ScenePointerUpEvent,
} from "@/types/map-canvas";
import { computeResize, RESIZE_CURSORS } from "./resize-utils";
import {
  getBoxObjectHandlePositions,
  isBoxObjectType,
  pointHitsObjectBody,
} from "./object-utils";
import {
  pointInImageLayer,
  resizeImageLayerFromHandle,
} from "./image-layer-transform";

export function commitPolygonObject(
  points: { x: number; y: number }[],
  onCreateObject: SceneInteractionHandlerContext["onCreateObject"],
  setIsDrawingPolygon: SceneInteractionHandlerContext["setIsDrawingPolygon"],
  setPolygonPoints: SceneInteractionHandlerContext["setPolygonPoints"],
  setPolygonCursorPos: SceneInteractionHandlerContext["setPolygonCursorPos"],
  lastClickRef: SceneInteractionHandlerContext["lastClickRef"],
): void {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const relativePoints = points.map((point) => ({
    x: point.x - minX,
    y: point.y - minY,
  }));

  onCreateObject(
    "polygon",
    minX,
    minY,
    maxX - minX,
    maxY - minY,
    relativePoints,
  );
  setIsDrawingPolygon(false);
  setPolygonPoints([]);
  setPolygonCursorPos(null);
  lastClickRef.current = null;
}

function commitPolygonVertexUpdate(
  context: SceneInteractionHandlerContext,
): void {
  if (!context.livePolyVertex) return;

  const activeObject = context.objects.find(
    (object) => object.id === context.livePolyVertex?.objectId,
  );
  if (activeObject) {
    const newPoints = activeObject.points.map((point, index) =>
      index === context.livePolyVertex?.vertexIndex
        ? {
            x: context.livePolyVertex.x,
            y: context.livePolyVertex.y,
          }
        : point,
    );
    context.onUpdatePolygonPoints(context.livePolyVertex.objectId, newPoints);
  }
  context.setLivePolyVertex(null);
}

function finishObjectPlacement(
  context: SceneInteractionHandlerContext,
): boolean {
  if (context.currentTool !== "select" || !context.objectPlaceRef.current) {
    return false;
  }

  if (
    context.liveObjectPlace &&
    (context.liveObjectPlace.width > 2 || context.liveObjectPlace.height > 2)
  ) {
    context.onCreateObject(
      context.liveObjectPlace.type,
      context.liveObjectPlace.x,
      context.liveObjectPlace.y,
      context.liveObjectPlace.width,
      context.liveObjectPlace.height,
      [],
    );
  }
  context.objectPlaceRef.current = null;
  context.setLiveObjectPlace(null);
  return true;
}

function finishObjectResize(context: SceneInteractionHandlerContext): boolean {
  if (context.currentTool !== "select" || !context.objectResizeRef.current) {
    return false;
  }

  if (context.liveObjectResize) {
    context.onResizeObject(
      context.liveObjectResize.objectId,
      context.liveObjectResize.x,
      context.liveObjectResize.y,
      context.liveObjectResize.width,
      context.liveObjectResize.height,
    );
    context.setLiveObjectResize(null);
  }
  context.objectResizeRef.current = null;
  return true;
}

function finishPolyVertexDrag(
  context: SceneInteractionHandlerContext,
): boolean {
  if (context.currentTool !== "select" || !context.polyVertexDragRef.current) {
    return false;
  }

  commitPolygonVertexUpdate(context);
  context.polyVertexDragRef.current = null;
  return true;
}

function finishObjectDrag(context: SceneInteractionHandlerContext): boolean {
  if (context.currentTool !== "select" || !context.objectDragRef.current) {
    return false;
  }

  if (context.liveObjectPos) {
    context.onMoveObject(
      context.liveObjectPos.objectId,
      context.liveObjectPos.x,
      context.liveObjectPos.y,
    );
    context.setLiveObjectPos(null);
  }
  context.objectDragRef.current = null;
  context.setIsMoving(false);
  return true;
}

function finishImageResize(context: SceneInteractionHandlerContext): boolean {
  if (context.currentTool !== "select" || !context.imageResizeRef.current) {
    return false;
  }

  if (context.liveImageResize) {
    context.onResizeImageLayer(
      context.liveImageResize.layerId,
      context.liveImageResize.x,
      context.liveImageResize.y,
      context.liveImageResize.width,
      context.liveImageResize.height,
    );
    context.setLiveImageResize(null);
  }
  context.imageResizeRef.current = null;
  context.setResizingHandle(null);
  return true;
}

function finishImageDrag(context: SceneInteractionHandlerContext): boolean {
  if (context.currentTool !== "select" || !context.imageDragRef.current) {
    return false;
  }

  if (context.liveImagePos) {
    context.onMoveImageLayer(
      context.liveImagePos.layerId,
      context.liveImagePos.x,
      context.liveImagePos.y,
    );
    context.setLiveImagePos(null);
  }
  context.imageDragRef.current = null;
  context.setIsMoving(false);
  return true;
}

function finishSelectionInteraction(
  context: SceneInteractionHandlerContext,
): boolean {
  if (context.currentTool !== "select" || !context.selActionRef.current) {
    return false;
  }

  const action = context.selActionRef.current;
  if (action.type === "move" && context.liveSelection) {
    const movedX = context.liveSelection.x !== action.orig.x;
    const movedY = context.liveSelection.y !== action.orig.y;
    if (movedX || movedY) {
      context.onMoveTiles(
        action.orig,
        context.liveSelection.x,
        context.liveSelection.y,
      );
    }
  }
  context.onSelectionChange(context.liveSelection);
  context.setLiveSelection(null);
  context.setIsMoving(false);
  context.setMoveTilesSnapshot(null);
  context.selActionRef.current = null;
  return true;
}

function finishPainting(context: SceneInteractionHandlerContext): void {
  if (!context.isPaintingRef.current) return;

  context.isPaintingRef.current = false;
  context.onPaintEnd();
}

export function handleScenePointerDown(
  event: ScenePointerDownEvent,
  context: SceneInteractionHandlerContext,
): void {
  if (event.button === 1 || event.button === 2) return;

  if (context.currentTool === "select") {
    if (context.pendingObjectType) {
      if (context.pendingObjectType === "polygon") {
        const px = event.x / context.zoom;
        const py = event.y / context.zoom;
        const now = Date.now();
        const last = context.lastClickRef.current;
        const isDoubleClick =
          last !== null &&
          now - last.time < 400 &&
          Math.hypot(event.x - last.x, event.y - last.y) < 12;
        context.lastClickRef.current = { time: now, x: event.x, y: event.y };

        if (!context.isDrawingPolygon) {
          context.setIsDrawingPolygon(true);
          context.setPolygonPoints([{ x: px, y: py }]);
          context.setPolygonCursorPos({ x: px, y: py });
        } else {
          const first = context.polygonPoints[0];
          const distToFirst = Math.hypot(
            (px - first.x) * context.zoom,
            (py - first.y) * context.zoom,
          );
          if (context.polygonPoints.length >= 3 && distToFirst < 15) {
            commitPolygonObject(
              context.polygonPoints,
              context.onCreateObject,
              context.setIsDrawingPolygon,
              context.setPolygonPoints,
              context.setPolygonCursorPos,
              context.lastClickRef,
            );
          } else if (isDoubleClick && context.polygonPoints.length >= 3) {
            commitPolygonObject(
              context.polygonPoints,
              context.onCreateObject,
              context.setIsDrawingPolygon,
              context.setPolygonPoints,
              context.setPolygonCursorPos,
              context.lastClickRef,
            );
          } else if (isDoubleClick && context.polygonPoints.length === 2) {
            commitPolygonObject(
              [...context.polygonPoints, { x: px, y: py }],
              context.onCreateObject,
              context.setIsDrawingPolygon,
              context.setPolygonPoints,
              context.setPolygonCursorPos,
              context.lastClickRef,
            );
          } else {
            context.setPolygonPoints((prev) => [...prev, { x: px, y: py }]);
          }
        }
        return;
      }

      if (context.pendingObjectType === "point") {
        const px = event.x / context.zoom;
        const py = event.y / context.zoom;
        context.onCreateObject("point", px, py, 0, 0, []);
        return;
      }

      context.objectPlaceRef.current = {
        type: context.pendingObjectType,
        startX: event.x,
        startY: event.y,
      };
      const px = event.x / context.zoom;
      const py = event.y / context.zoom;
      context.setLiveObjectPlace({
        type: context.pendingObjectType,
        x: px,
        y: py,
        width: 0,
        height: 0,
      });
      return;
    }

    const activeObject = context.objects.find(
      (object) => object.id === context.activeObjectId,
    );
    if (activeObject && isBoxObjectType(activeObject)) {
      const handles = getBoxObjectHandlePositions(
        activeObject,
        context.zoom,
        context.getObjectInteractionOverrides(activeObject),
      );
      for (const [handle, cx, cy] of handles) {
        if (Math.abs(event.x - cx) <= 8 && Math.abs(event.y - cy) <= 8) {
          context.objectResizeRef.current = {
            objectId: activeObject.id,
            handle,
            startX: event.x,
            startY: event.y,
            origX: activeObject.x,
            origY: activeObject.y,
            origWidth: activeObject.width,
            origHeight: activeObject.height,
          };
          return;
        }
      }
    }

    if (activeObject && activeObject.type === "polygon") {
      const objectX = activeObject.x * context.zoom;
      const objectY = activeObject.y * context.zoom;
      for (let index = 0; index < activeObject.points.length; index += 1) {
        const vx = objectX + activeObject.points[index].x * context.zoom;
        const vy = objectY + activeObject.points[index].y * context.zoom;
        if (Math.abs(event.x - vx) <= 8 && Math.abs(event.y - vy) <= 8) {
          context.polyVertexDragRef.current = {
            objectId: activeObject.id,
            vertexIndex: index,
            startX: event.x,
            startY: event.y,
            origPoint: { ...activeObject.points[index] },
          };
          return;
        }
      }
    }

    const isObjectLayer = context.objectLayers.some(
      (layer) => layer.id === context.activeLayerId,
    );
    if (isObjectLayer) {
      const layerObjects = context.objects
        .filter(
          (object) =>
            object.layerId === context.activeLayerId && object.visible,
        )
        .reverse();
      for (const object of layerObjects) {
        if (pointHitsObjectBody(object, event.x, event.y, context.zoom)) {
          const now = Date.now();
          const lastObjectClick = context.lastObjectClickRef.current;
          const isObjectDoubleClick =
            lastObjectClick !== null &&
            lastObjectClick.objectId === object.id &&
            now - lastObjectClick.time < 400 &&
            Math.hypot(
              event.x - lastObjectClick.x,
              event.y - lastObjectClick.y,
            ) < 12;
          context.lastObjectClickRef.current = {
            time: now,
            x: event.x,
            y: event.y,
            objectId: object.id,
          };

          if (isObjectDoubleClick) {
            context.onDoubleClickObject?.(object.id);
            context.lastObjectClickRef.current = null;
            return;
          }

          context.onSelectObject(object.id);
          if (!object.locked) {
            context.objectDragRef.current = {
              objectId: object.id,
              startX: event.x,
              startY: event.y,
              origX: object.x,
              origY: object.y,
            };
            context.setIsMoving(true);
          }
          return;
        }
      }
      context.onSelectObject(null);
      return;
    }

    const resizeHandle = context.hitTestResizeHandle(event.x, event.y);
    if (resizeHandle) {
      const resizeImageLayer = context.imageLayers.find(
        (layer) => layer.id === context.activeLayerId,
      );
      if (resizeImageLayer) {
        context.imageResizeRef.current = {
          layerId: resizeImageLayer.id,
          handle: resizeHandle,
          startX: event.x,
          startY: event.y,
          origX: resizeImageLayer.x,
          origY: resizeImageLayer.y,
          origWidth: resizeImageLayer.width,
          origHeight: resizeImageLayer.height,
          rotation: resizeImageLayer.rotation ?? 0,
          flipX: resizeImageLayer.flipX ?? false,
          flipY: resizeImageLayer.flipY ?? false,
        };
        context.setResizingHandle(resizeHandle);
        return;
      }
    }

    const activeImageLayer = context.imageLayers.find(
      (layer) => layer.id === context.activeLayerId,
    );
    if (activeImageLayer) {
      const interactiveLayer =
        context.getInteractiveImageLayer(activeImageLayer);
      if (
        pointInImageLayer(interactiveLayer, {
          x: event.x / context.zoom,
          y: event.y / context.zoom,
        })
      ) {
        context.imageDragRef.current = {
          layerId: activeImageLayer.id,
          startX: event.x,
          startY: event.y,
          origX: interactiveLayer.x,
          origY: interactiveLayer.y,
        };
        context.setIsMoving(true);
        return;
      }
    }

    const selectionPos = context.getClampedGridPos(event.x, event.y);
    if (!selectionPos) return;

    if (
      context.renderedSelection &&
      context.isInsideSelection(event.x, event.y, context.renderedSelection)
    ) {
      const activeLayer = context.layers.find(
        (layer) => layer.id === context.activeLayerId,
      );
      const tileSnapshot: { dx: number; dy: number; ref: TileRef }[] = [];
      if (activeLayer) {
        for (let dy = 0; dy < context.renderedSelection.height; dy += 1) {
          for (let dx = 0; dx < context.renderedSelection.width; dx += 1) {
            const key = `${context.renderedSelection.x + dx},${context.renderedSelection.y + dy}`;
            const ref = activeLayer.tiles[key];
            if (ref) {
              tileSnapshot.push({ dx, dy, ref });
            }
          }
        }
      }
      context.selActionRef.current = {
        type: "move",
        offsetX: selectionPos.x - context.renderedSelection.x,
        offsetY: selectionPos.y - context.renderedSelection.y,
        orig: { ...context.renderedSelection },
        tiles: tileSnapshot,
      };
      context.setMoveTilesSnapshot(tileSnapshot);
      context.setIsMoving(true);
      return;
    }

    context.selActionRef.current = {
      type: "draw",
      startX: selectionPos.x,
      startY: selectionPos.y,
    };
    context.setLiveSelection({
      x: selectionPos.x,
      y: selectionPos.y,
      width: 1,
      height: 1,
    });
    return;
  }

  const pos = context.getGridPos(event.x, event.y);
  if (!pos) return;

  context.isPaintingRef.current = true;
  context.onPaintTile(pos.x, pos.y);
}

export function handleScenePointerMove(
  event: ScenePointerPosition,
  context: SceneInteractionHandlerContext,
): void {
  context.lastPointerPosRef.current = event;
  const pos = context.getGridPos(event.x, event.y);
  context.drawOverlayPreview(event, pos);

  if (context.isDrawingPolygon) {
    context.setPolygonCursorPos({
      x: event.x / context.zoom,
      y: event.y / context.zoom,
    });
  }

  if (context.currentTool === "select") {
    const placeAction = context.objectPlaceRef.current;
    if (placeAction) {
      const startPx = placeAction.startX / context.zoom;
      const startPy = placeAction.startY / context.zoom;
      const curPx = event.x / context.zoom;
      const curPy = event.y / context.zoom;
      context.setLiveObjectPlace({
        type: placeAction.type,
        x: Math.min(startPx, curPx),
        y: Math.min(startPy, curPy),
        width: Math.abs(curPx - startPx),
        height: Math.abs(curPy - startPy),
      });
      return;
    }

    const objectResize = context.objectResizeRef.current;
    if (objectResize) {
      const rdx = (event.x - objectResize.startX) / context.zoom;
      const rdy = (event.y - objectResize.startY) / context.zoom;
      const result = computeResize(
        objectResize.handle,
        objectResize.origX,
        objectResize.origY,
        objectResize.origWidth,
        objectResize.origHeight,
        rdx,
        rdy,
        context.shiftKeyRef.current,
      );
      context.setLiveObjectResize({
        objectId: objectResize.objectId,
        ...result,
      });
      return;
    }

    const polyVertexDrag = context.polyVertexDragRef.current;
    if (polyVertexDrag) {
      const dx = (event.x - polyVertexDrag.startX) / context.zoom;
      const dy = (event.y - polyVertexDrag.startY) / context.zoom;
      context.setLivePolyVertex({
        objectId: polyVertexDrag.objectId,
        vertexIndex: polyVertexDrag.vertexIndex,
        x: polyVertexDrag.origPoint.x + dx,
        y: polyVertexDrag.origPoint.y + dy,
      });
      return;
    }

    const objectDrag = context.objectDragRef.current;
    if (objectDrag) {
      const dx = (event.x - objectDrag.startX) / context.zoom;
      const dy = (event.y - objectDrag.startY) / context.zoom;
      context.setLiveObjectPos({
        objectId: objectDrag.objectId,
        x: Math.round(objectDrag.origX + dx),
        y: Math.round(objectDrag.origY + dy),
      });
      return;
    }

    const resizeAction = context.imageResizeRef.current;
    if (resizeAction) {
      const result = resizeImageLayerFromHandle(
        {
          x: resizeAction.origX,
          y: resizeAction.origY,
          width: resizeAction.origWidth,
          height: resizeAction.origHeight,
          rotation: resizeAction.rotation,
          flipX: resizeAction.flipX,
          flipY: resizeAction.flipY,
        },
        resizeAction.handle,
        {
          x: event.x / context.zoom,
          y: event.y / context.zoom,
        },
        context.shiftKeyRef.current,
      );
      context.setLiveImageResize({ layerId: resizeAction.layerId, ...result });
      return;
    }

    const imageDrag = context.imageDragRef.current;
    if (imageDrag) {
      const dx = (event.x - imageDrag.startX) / context.zoom;
      const dy = (event.y - imageDrag.startY) / context.zoom;
      context.setLiveImagePos({
        layerId: imageDrag.layerId,
        x: Math.round(imageDrag.origX + dx),
        y: Math.round(imageDrag.origY + dy),
      });
      return;
    }

    const action = context.selActionRef.current;
    if (!action) {
      const handle = context.hitTestResizeHandle(event.x, event.y);
      context.setHoveredHandle(handle);

      const isObjectLayerActive = context.objectLayers.some(
        (layer) => layer.id === context.activeLayerId,
      );
      if (isObjectLayerActive && !handle) {
        let objectCursor: string | null = null;
        const activeObject = context.objects.find(
          (object) => object.id === context.activeObjectId,
        );

        if (activeObject && isBoxObjectType(activeObject)) {
          const handles = getBoxObjectHandlePositions(
            activeObject,
            context.zoom,
            context.getObjectInteractionOverrides(activeObject),
          );
          for (const [handleId, cx, cy] of handles) {
            if (Math.abs(event.x - cx) <= 8 && Math.abs(event.y - cy) <= 8) {
              objectCursor = RESIZE_CURSORS[handleId];
              break;
            }
          }
        }

        if (!objectCursor && activeObject && activeObject.type === "polygon") {
          const objectX = activeObject.x * context.zoom;
          const objectY = activeObject.y * context.zoom;
          for (const point of activeObject.points) {
            const vx = objectX + point.x * context.zoom;
            const vy = objectY + point.y * context.zoom;
            if (Math.abs(event.x - vx) <= 8 && Math.abs(event.y - vy) <= 8) {
              objectCursor = "pointer";
              break;
            }
          }
        }

        if (!objectCursor) {
          const layerObjects = context.objects
            .filter(
              (object) =>
                object.layerId === context.activeLayerId && object.visible,
            )
            .reverse();
          for (const object of layerObjects) {
            if (pointHitsObjectBody(object, event.x, event.y, context.zoom)) {
              objectCursor = object.locked ? "not-allowed" : "move";
              break;
            }
          }
        }

        context.setHoveredObjectCursor(objectCursor);
      } else if (!isObjectLayerActive) {
        context.setHoveredObjectCursor(null);
      }
      return;
    }

    const selectionPos = context.getClampedGridPos(event.x, event.y);
    if (!selectionPos) return;

    if (action.type === "draw") {
      const x1 = Math.min(
        action.startX,
        Math.max(0, Math.min(selectionPos.x, context.mapW - 1)),
      );
      const y1 = Math.min(
        action.startY,
        Math.max(0, Math.min(selectionPos.y, context.mapH - 1)),
      );
      const x2 = Math.max(
        action.startX,
        Math.max(0, Math.min(selectionPos.x, context.mapW - 1)),
      );
      const y2 = Math.max(
        action.startY,
        Math.max(0, Math.min(selectionPos.y, context.mapH - 1)),
      );
      context.setLiveSelection({
        x: x1,
        y: y1,
        width: x2 - x1 + 1,
        height: y2 - y1 + 1,
      });
    } else {
      const newX = Math.max(
        0,
        Math.min(
          selectionPos.x - action.offsetX,
          context.mapW - action.orig.width,
        ),
      );
      const newY = Math.max(
        0,
        Math.min(
          selectionPos.y - action.offsetY,
          context.mapH - action.orig.height,
        ),
      );
      context.setLiveSelection({ ...action.orig, x: newX, y: newY });
    }
    return;
  }

  if (!context.isPaintingRef.current) return;
  if (context.currentTool === "fill") return;
  if (!pos) return;

  context.onPaintTile(pos.x, pos.y);
}

export function handleScenePointerUp(
  event: ScenePointerUpEvent | undefined,
  context: SceneInteractionHandlerContext,
): void {
  if (event?.button === 1) return;
  if (finishObjectPlacement(context)) return;
  if (finishObjectResize(context)) return;
  if (finishPolyVertexDrag(context)) return;
  if (finishObjectDrag(context)) return;
  if (finishImageResize(context)) return;
  if (finishImageDrag(context)) return;
  if (finishSelectionInteraction(context)) return;

  finishPainting(context);
}

export function handleScenePointerLeave(
  context: SceneInteractionHandlerContext,
): void {
  context.lastPointerPosRef.current = null;
  context.fillPreviewCacheRef.current.tileKey = null;
  context.fillPreviewCacheRef.current.region = [];
  context.clearOverlay();

  if (finishObjectPlacement(context)) return;
  if (finishObjectResize(context)) return;
  if (finishPolyVertexDrag(context)) return;
  if (finishObjectDrag(context)) return;
  if (finishImageResize(context)) return;
  if (finishImageDrag(context)) return;
  if (finishSelectionInteraction(context)) return;

  finishPainting(context);
}
