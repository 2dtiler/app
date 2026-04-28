import { assert, test } from "vitest";
import {
  buildTextObjectPatch,
  clampTextObjectBounds,
  getTextObjectEditableFields,
  getTextObjectSettings,
  isReservedTextObjectPropertyKey,
  isTextObject,
  normalizeTextObject,
} from "@/features/map-editor/lib/text-objects";
import type { MapObject } from "@/types";

test("text object helpers parse settings, build patches, and normalize bounds", () => {
  const textObject = {
    id: "object-text" as MapObject["id"],
    layerId: "layer-objects" as MapObject["layerId"],
    name: "Label",
    type: "text",
    x: 8,
    y: 12,
    width: 0,
    height: Number.NaN,
    rotation: 15,
    points: [],
    visible: true,
    locked: false,
    properties: {
      Text: { value: " Hello ", type: "string" },
      Size: { value: "18.2", type: "float" },
      Rotation: { value: "45", type: "float" },
      Font: { value: "  Space Grotesk  ", type: "string" },
      "Word wrap": { value: "off", type: "bool" },
      Color: { value: "  #abcdef  ", type: "color" },
    },
  } as MapObject;

  assert.strictEqual(isTextObject(textObject), true);
  assert.strictEqual(isTextObject(null), false);
  assert.strictEqual(isReservedTextObjectPropertyKey("Text"), true);
  assert.strictEqual(isReservedTextObjectPropertyKey("custom"), false);

  const settings = getTextObjectSettings(textObject);
  assert.deepEqual(settings, {
    text: " Hello ",
    size: 18,
    rotation: 45,
    font: "Space Grotesk",
    wordWrap: false,
    color: "#abcdef",
  });
  assert.deepEqual(getTextObjectEditableFields(textObject), {
    text: " Hello ",
    size: "18",
    rotation: "45",
    font: "Space Grotesk",
    wordWrap: false,
    color: "#abcdef",
  });

  const patch = buildTextObjectPatch(textObject, {
    text: "Updated",
    size: "not-a-number",
    rotation: "invalid",
    font: "  ",
    wordWrap: true,
    color: "  ",
  });
  assert.strictEqual(patch.rotation, 15);
  assert.strictEqual(patch.properties?.Text?.value, "Updated");
  assert.strictEqual(patch.properties?.Size?.value, "11");
  assert.strictEqual(patch.properties?.Font?.value, "sans-serif");
  assert.strictEqual(patch.properties?.["Word wrap"]?.value, "true");
  assert.strictEqual(patch.properties?.Color?.value, "#000000");

  normalizeTextObject(textObject);
  assert.strictEqual(textObject.width, 96);
  assert.strictEqual(textObject.height, 32);
  assert.strictEqual(textObject.rotation, 45);
  assert.strictEqual(textObject.properties.Text?.value, " Hello ");
  assert.deepEqual(clampTextObjectBounds(-1, Number.NaN), {
    width: 96,
    height: 32,
  });
});