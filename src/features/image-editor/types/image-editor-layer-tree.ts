import type {
  ImageEditorGroupId,
  ImageEditorImageLayer,
  ImageEditorLayerGroup,
  ImageEditorRasterLayer,
} from "./index";

export type ImageEditorLayerTreeNode =
  | {
      type: "rasterLayer";
      layer: ImageEditorRasterLayer;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    }
  | {
      type: "imageLayer";
      layer: ImageEditorImageLayer;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    }
  | {
      type: "group";
      group: ImageEditorLayerGroup;
      depth: number;
      parentGroupId: ImageEditorGroupId | null;
    };
