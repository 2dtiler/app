import type { MapObject, PropertyValue } from "./schema";

export const TEXT_OBJECT_PROPERTY_KEYS = {
  text: "Text",
  size: "Size",
  rotation: "Rotation",
  font: "Font",
  wordWrap: "Word wrap",
  color: "Color",
} as const;

export const TEXT_OBJECT_DEFAULTS = {
  text: "",
  size: 11,
  rotation: 0,
  font: "sans-serif",
  wordWrap: true,
  color: "#000000",
  width: 96,
  height: 32,
} as const;

export type TextObjectPropertyKey =
  (typeof TEXT_OBJECT_PROPERTY_KEYS)[keyof typeof TEXT_OBJECT_PROPERTY_KEYS];

export interface TextObjectSettings {
  text: string;
  size: number;
  rotation: number;
  font: string;
  wordWrap: boolean;
  color: string;
}

export interface TextObjectEditableFields {
  text: string;
  size: string;
  rotation: string;
  font: string;
  wordWrap: boolean;
  color: string;
}

export interface TextObjectPatch {
  rotation?: number;
  properties?: Record<string, PropertyValue>;
}

export interface TextObjectFontOption {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

export interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

export interface QueryLocalFontsWindow extends Window {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
}

export interface TextObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextObjectEditingState {
  objectId: string;
  text: string;
}

export type TextObjectMapObject = MapObject & { type: "text" };
