import { v4 as uuidv4 } from "uuid";
import type {
  AssetId,
  LayerGroupId,
  LayerId,
  MapGroupId,
  MapId,
  ObjectId,
  ProjectId,
  TerrainId,
  TilesetGroupId,
  TilesetId,
} from "@/types";

export const generateProjectId = () => uuidv4() as ProjectId;
export const generateTilesetId = () => uuidv4() as TilesetId;
export const generateTilesetGroupId = () => uuidv4() as TilesetGroupId;
export const generateMapId = () => uuidv4() as MapId;
export const generateMapGroupId = () => uuidv4() as MapGroupId;
export const generateLayerId = () => uuidv4() as LayerId;
export const generateLayerGroupId = () => uuidv4() as LayerGroupId;
export const generateAssetId = () => uuidv4() as AssetId;
export const generateTerrainId = () => uuidv4() as TerrainId;
export const generateObjectId = () => uuidv4() as ObjectId;