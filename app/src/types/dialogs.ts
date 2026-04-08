import type { ReactNode } from "react";
import type { ToolName } from "./components";
import type {
  MapObject,
  PropertyType,
  PropertyValue,
  TerrainTile,
  TileMapData,
} from "./schema";

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface FillTerrainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tiles: TerrainTile[]) => void;
}

export type FindReplaceGridSize = 1 | 2 | 3 | 4 | 5;

export interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type AddLayerDialogLayerType = "tile" | "group" | "image" | "object";

export interface AddLayerDialogLayerTypeOption {
  type: AddLayerDialogLayerType;
  label: string;
  icon: ReactNode;
  description: string;
}

export interface AddLayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onCreateLayer: (name: string, type: AddLayerDialogLayerType) => void;
  onRequestImageLayer?: () => void;
  allowedTypes?: AddLayerDialogLayerType[];
}

export interface ObjectPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  object: MapObject;
  onSave: (properties: Record<string, PropertyValue>, name?: string) => void;
}

export interface EditablePropertyEntry {
  key: string;
  value: string;
  type: PropertyType;
}

export interface MapOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: TileMapData;
  onSave: (
    width: number,
    height: number,
    properties: Record<string, PropertyValue>,
  ) => void;
}

export interface NewMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  onNameChange: (value: string) => void;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onCreate: () => void;
}

export interface NewMapGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
}

export interface NewTilesetGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
}

export interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectLoaded: () => void;
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface SettingsKeyRowProps {
  id: string;
  label: string;
  url: string;
  placeholder: string;
}

export interface ToolDrawerProps {
  activeTool: ToolName | null;
  onClose: () => void;
}
