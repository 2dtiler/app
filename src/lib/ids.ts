import { v4 as uuidv4 } from "uuid";
import type {
  ProjectId,
  TilesetId,
  TilesetGroupId,
  MapId,
  MapGroupId,
  LayerId,
  LayerGroupId,
  AssetId,
} from "@/types";

export const generateProjectId = () => uuidv4() as ProjectId;
export const generateTilesetId = () => uuidv4() as TilesetId;
export const generateTilesetGroupId = () => uuidv4() as TilesetGroupId;
export const generateMapId = () => uuidv4() as MapId;
export const generateMapGroupId = () => uuidv4() as MapGroupId;
export const generateLayerId = () => uuidv4() as LayerId;
export const generateLayerGroupId = () => uuidv4() as LayerGroupId;
export const generateAssetId = () => uuidv4() as AssetId;
