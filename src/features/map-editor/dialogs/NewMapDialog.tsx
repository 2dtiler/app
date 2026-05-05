import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { NEW_MAP_TYPE_OPTIONS } from "@/features/map-editor/lib/map-geometry";
import type { NewMapDialogProps } from "@/features/map-editor/types/dialogs";

const ALL_MAP_IMPORT_ACCEPT =
  "image/*,.2dm,.tmx,.tmj,.xml,.js,.lua,.tscn,.yy,.room.gmx,.fmp,.tide,.tilemap,.collection,.prefab,.json";

export function NewMapDialog({
  open,
  onOpenChange,
  name,
  width,
  height,
  mapType,
  tileSize,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onMapTypeChange,
  onCreate,
  onImportMapFromFile,
}: NewMapDialogProps) {
  const [tab, setTab] = useState<"new" | "import">("new");
  const [isDroppingFile, setIsDroppingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportFile(file: File) {
    const success = await onImportMapFromFile(file);
    if (success) {
      onOpenChange(false);
    }
  }

  function handleDragOver(e: DragEvent<HTMLElement>) {
    if (!Array.from(e.dataTransfer.items).some((i) => i.kind === "file"))
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDroppingFile(true);
  }

  function handleDragLeave(e: DragEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDroppingFile(false);
  }

  async function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDroppingFile(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleImportFile(file);
  }

  async function handleFileInputChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await handleImportFile(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTab("new");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-90">
        <DialogHeader>
          <DialogTitle>Add Map</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new map or import one from a file
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "new" | "import")}
        >
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="new" className="flex-1 text-xs">
              New Map
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1 text-xs">
              From File
            </TabsTrigger>
          </TabsList>
          <TabsContent value="new">
            <div className="space-y-3">
              <div>
                <Label htmlFor="new-map-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="new-map-name"
                  name="new-map-name"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="new-map-width" className="text-xs">
                    Width (tiles)
                  </Label>
                  <Input
                    id="new-map-width"
                    name="new-map-width"
                    type="number"
                    min={1}
                    max={256}
                    value={width}
                    onChange={(e) => onWidthChange(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="new-map-height" className="text-xs">
                    Height (tiles)
                  </Label>
                  <Input
                    id="new-map-height"
                    name="new-map-height"
                    type="number"
                    min={1}
                    max={256}
                    value={height}
                    onChange={(e) => onHeightChange(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="new-map-type" className="text-xs">
                  Map Type
                </Label>
                <Select value={mapType} onValueChange={onMapTypeChange}>
                  <SelectTrigger
                    id="new-map-type"
                    aria-label="Map Type"
                    className="mt-1 w-full"
                  >
                    <SelectValue placeholder="Select a map type" />
                  </SelectTrigger>
                  <SelectContent>
                    {NEW_MAP_TYPE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-xs"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Map grid size: {width} × {height} tiles (base tile size:{" "}
                {tileSize}px)
              </p>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onMouseDown={onCreate}>
                Create
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="import">
            <button
              type="button"
              className={`flex w-full min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 transition-colors ${
                isDroppingFile
                  ? "border-primary bg-primary/10"
                  : "border-muted-foreground/30 hover:border-muted-foreground/50"
              }`}
              aria-label="Drop a map file here or click to browse"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
              onClick={() => importFileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-center">
                <p className="text-xs font-medium">
                  Drop a map file here or click to browse
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Supports .2dm, .tmx, .tmj, .tscn, .yy, .fmp, .tide,
                  .tilemap, .prefab, images, and more
                </p>
              </div>
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept={ALL_MAP_IMPORT_ACCEPT}
              className="hidden"
              onChange={(e) => void handleFileInputChange(e)}
            />
            <DialogFooter className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
