import { assert, test } from "vitest";
import {
  generateAssetId,
  generateAutotileRuleId,
  generateAutotileTerrainId,
  generateLayerGroupId,
  generateLayerId,
  generateMapGroupId,
  generateMapId,
  generateObjectId,
  generateProjectId,
  generateTerrainId,
  generateTilesetGroupId,
  generateTilesetId,
} from "@/utils/ids";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("generates UUID-backed branded identifiers", () => {
  const idGenerators = [
    generateProjectId,
    generateTilesetId,
    generateTilesetGroupId,
    generateMapId,
    generateMapGroupId,
    generateLayerId,
    generateLayerGroupId,
    generateAssetId,
    generateTerrainId,
    generateObjectId,
    generateAutotileTerrainId,
    generateAutotileRuleId,
  ];

  for (const generateId of idGenerators) {
    assert.match(generateId(), UUID_PATTERN);
  }
});
