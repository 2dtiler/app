import type {
  MapObject,
  PropertyType,
  PropertyValue,
  TextObjectMapObject,
} from "@/types";
import {
  TEXT_OBJECT_DEFAULTS,
  TEXT_OBJECT_PROPERTY_KEYS,
  type TextObjectEditableFields,
  type TextObjectPatch,
  type TextObjectSettings,
} from "@/types";

const RESERVED_TEXT_OBJECT_KEYS = new Set(
  Object.values(TEXT_OBJECT_PROPERTY_KEYS),
);

function parseNumberValue(
  raw: PropertyValue | string | undefined,
  fallback: number,
): number {
  const value = typeof raw === "string" ? raw : raw?.value;
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanValue(
  raw: PropertyValue | string | undefined,
  fallback: boolean,
): boolean {
  const value = typeof raw === "string" ? raw : raw?.value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseStringValue(
  raw: PropertyValue | string | undefined,
  fallback: string,
): string {
  const value = typeof raw === "string" ? raw : raw?.value;
  if (typeof value !== "string") return fallback;
  return value;
}

function setPropertyValue(
  properties: Record<string, PropertyValue>,
  key: string,
  value: string,
  type: PropertyType,
) {
  properties[key] = { value, type };
}

export function isTextObject(
  object: MapObject | null | undefined,
): object is TextObjectMapObject {
  return object?.type === "text";
}

export function isReservedTextObjectPropertyKey(key: string): boolean {
  return RESERVED_TEXT_OBJECT_KEYS.has(
    key as (typeof TEXT_OBJECT_PROPERTY_KEYS)[keyof typeof TEXT_OBJECT_PROPERTY_KEYS],
  );
}

export function getDefaultTextObjectProperties(
  overrides?: Partial<TextObjectSettings>,
): Record<string, PropertyValue> {
  const merged = {
    ...TEXT_OBJECT_DEFAULTS,
    ...overrides,
  };
  return {
    [TEXT_OBJECT_PROPERTY_KEYS.text]: {
      value: merged.text,
      type: "string",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.size]: {
      value: String(Math.round(merged.size)),
      type: "int",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.rotation]: {
      value: String(merged.rotation),
      type: "float",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.font]: {
      value: merged.font,
      type: "string",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.wordWrap]: {
      value: merged.wordWrap ? "true" : "false",
      type: "bool",
    },
    [TEXT_OBJECT_PROPERTY_KEYS.color]: {
      value: merged.color,
      type: "color",
    },
  };
}

export function getTextObjectSettings(object: MapObject): TextObjectSettings {
  const properties = object.properties ?? {};
  const size = Math.max(
    1,
    Math.round(
      parseNumberValue(
        properties[TEXT_OBJECT_PROPERTY_KEYS.size],
        TEXT_OBJECT_DEFAULTS.size,
      ),
    ),
  );
  const rotation = parseNumberValue(
    properties[TEXT_OBJECT_PROPERTY_KEYS.rotation],
    object.rotation ?? TEXT_OBJECT_DEFAULTS.rotation,
  );
  const font = parseStringValue(
    properties[TEXT_OBJECT_PROPERTY_KEYS.font],
    TEXT_OBJECT_DEFAULTS.font,
  ).trim();
  const text = parseStringValue(
    properties[TEXT_OBJECT_PROPERTY_KEYS.text],
    TEXT_OBJECT_DEFAULTS.text,
  );
  const color = parseStringValue(
    properties[TEXT_OBJECT_PROPERTY_KEYS.color],
    TEXT_OBJECT_DEFAULTS.color,
  ).trim();
  return {
    text,
    size,
    rotation,
    font: font || TEXT_OBJECT_DEFAULTS.font,
    wordWrap: parseBooleanValue(
      properties[TEXT_OBJECT_PROPERTY_KEYS.wordWrap],
      TEXT_OBJECT_DEFAULTS.wordWrap,
    ),
    color: color || TEXT_OBJECT_DEFAULTS.color,
  };
}

export function getTextObjectEditableFields(
  object: MapObject,
): TextObjectEditableFields {
  const settings = getTextObjectSettings(object);
  return {
    text: settings.text,
    size: String(settings.size),
    rotation: String(settings.rotation),
    font: settings.font,
    wordWrap: settings.wordWrap,
    color: settings.color,
  };
}

export function buildTextObjectPatch(
  object: MapObject,
  fields: TextObjectEditableFields,
): TextObjectPatch {
  const nextText = fields.text;
  const nextSize = Math.max(
    1,
    Math.round(Number.parseFloat(fields.size) || TEXT_OBJECT_DEFAULTS.size),
  );
  const nextRotation = Number.parseFloat(fields.rotation);
  const rotation = Number.isFinite(nextRotation)
    ? nextRotation
    : (object.rotation ?? TEXT_OBJECT_DEFAULTS.rotation);
  const nextFont = fields.font.trim() || TEXT_OBJECT_DEFAULTS.font;
  const nextColor = fields.color.trim() || TEXT_OBJECT_DEFAULTS.color;

  const properties = {
    ...(object.properties ?? {}),
  };
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.text,
    nextText,
    "string",
  );
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.size,
    String(nextSize),
    "int",
  );
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.rotation,
    String(rotation),
    "float",
  );
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.font,
    nextFont,
    "string",
  );
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.wordWrap,
    fields.wordWrap ? "true" : "false",
    "bool",
  );
  setPropertyValue(
    properties,
    TEXT_OBJECT_PROPERTY_KEYS.color,
    nextColor,
    "color",
  );

  return {
    rotation,
    properties,
  };
}

export function normalizeTextObject(object: MapObject): MapObject {
  if (object.type !== "text") return object;

  const settings = getTextObjectSettings(object);
  object.rotation = settings.rotation;
  object.width =
    Number.isFinite(object.width) && object.width > 0
      ? object.width
      : TEXT_OBJECT_DEFAULTS.width;
  object.height =
    Number.isFinite(object.height) && object.height > 0
      ? object.height
      : TEXT_OBJECT_DEFAULTS.height;
  object.properties = {
    ...object.properties,
    ...getDefaultTextObjectProperties(settings),
  };
  return object;
}

export function clampTextObjectBounds(width: number, height: number) {
  return {
    width:
      Number.isFinite(width) && width > 0 ? width : TEXT_OBJECT_DEFAULTS.width,
    height:
      Number.isFinite(height) && height > 0
        ? height
        : TEXT_OBJECT_DEFAULTS.height,
  };
}
