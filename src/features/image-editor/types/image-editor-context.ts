import type { AssetId, LayerId } from "@/types/map/schema";

export interface ImageLayerEditorContext {
  layerId: LayerId;
  assetId: AssetId;
  width: number;
  height: number;
}
