import type { TilesetFileInputProps } from "@/features/map-editor/types/tileset-panel";

export function TilesetFileInput({
  fileInputRef,
  onChange,
  id = "tileset-file-input",
  name = "tileset-file-input",
  accept = "image/*,.2dt,.tsx,.tsj,.xml,.json,.lua,.tres,.tilesource,.prefab",
}: TilesetFileInputProps) {
  return (
    <input
      ref={fileInputRef}
      id={id}
      name={name}
      type="file"
      accept={accept}
      className="hidden"
      onChange={onChange}
    />
  );
}
