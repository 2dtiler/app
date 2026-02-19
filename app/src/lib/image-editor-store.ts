/**
 * Image editor state store — a separate `travels` instance from the main
 * editor store, so image editor undo/redo is independent.
 *
 * This only tracks *metadata* (tool, palette, frames list, zoom, etc.).
 * Actual pixel data lives in-memory as ImageData objects managed by
 * the pixel history system.
 */

import { createTravels, type Travels } from "travels";
import {
  DEFAULT_IMAGE_EDITOR_STATE,
  type ImageEditorState,
  type FrameId,
  type Frame,
  type Palette,
  type PaletteId,
  type ImageEditorLayerId,
  type ImageEditorRasterLayer,
} from "@/types/image-editor";
import { v4 as uuidv4 } from "uuid";

type ImageEditorTravels = Travels<
  ImageEditorState,
  false,
  true,
  Record<string, never>
>;

let instance: ImageEditorTravels | null = null;

/**
 * Create (or re-create) the image editor store for a new canvas.
 */
export function initImageEditorStore(
  width: number,
  height: number,
  initialPalettes?: Palette[],
): ImageEditorTravels {
  const firstFrameId = uuidv4() as FrameId;
  const firstFrame: Frame = {
    id: firstFrameId,
    name: "Frame 1",
    duration: 100,
  };

  const palettes =
    initialPalettes && initialPalettes.length > 0
      ? initialPalettes
      : DEFAULT_IMAGE_EDITOR_STATE.palettes;
  const activePaletteId: PaletteId =
    palettes[0]?.id ?? DEFAULT_IMAGE_EDITOR_STATE.activePaletteId;

  // Create default "Layer 1" raster layer
  const firstLayerId = uuidv4() as ImageEditorLayerId;
  const firstLayer: ImageEditorRasterLayer = {
    id: firstLayerId,
    name: "Layer 1",
    visible: true,
    locked: false,
    type: "tile",
  };

  instance = createTravels<ImageEditorState>(
    {
      ...DEFAULT_IMAGE_EDITOR_STATE,
      width,
      height,
      frames: [firstFrame],
      currentFrameIndex: 0,
      palettes,
      activePaletteId,
      layers: [firstLayer],
      imageLayers: [],
      layerGroups: [],
      layerOrder: [firstLayerId],
      activeLayerId: firstLayerId,
    },
    { maxHistory: 50 },
  );

  return instance;
}

/**
 * Get the current image editor store. Throws if not initialized.
 */
export function getImageEditorStore(): ImageEditorTravels {
  if (!instance) {
    throw new Error(
      "Image editor store not initialized. Call initImageEditorStore() first.",
    );
  }
  return instance;
}

/**
 * Check whether the image editor store has been initialized.
 */
export function isImageEditorStoreReady(): boolean {
  return instance !== null;
}

/**
 * Tear down the image editor store (when the editor is closed).
 */
export function destroyImageEditorStore(): void {
  instance = null;
}
