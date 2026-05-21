import type { TilesetFileInputProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetFileInput({
  fileInputRef,
  onChange,
}: TilesetFileInputProps) {
  return (
    <input
      ref={fileInputRef}
      id="tileset-file-input"
      name="tileset-file-input"
      type="file"
      accept="image/*,.2dt,.tsx,.tsj,.xml,.json,.lua,.tres,.tilesource,.prefab"
      className="hidden"
      onChange={onChange}
    />
  );
}
