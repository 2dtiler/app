import { useRef, useCallback, useState } from "react";
import {
  Plus,
  Trash2,
  FileDown,
  FileUp,
  RotateCcw,
  Pencil,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ColorPicker,
  ColorPickerSelection,
  ColorPickerHue,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerOutput,
  ColorPickerFormat,
} from "@/components/ui/color-picker";
import type { Color } from "@/types/image-editor";
import type { PalettePanelProps } from "@/types/image-editor-ui";

function colorToHex(c: Color): string {
  const r = c.r.toString(16).padStart(2, "0");
  const g = c.g.toString(16).padStart(2, "0");
  const b = c.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function colorsMatch(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

export function PalettePanel({
  palettes,
  activePaletteId,
  onSwitchPalette,
  onRenamePalette,
  onDeletePalette,
  onDuplicatePalette,
  colors,
  primaryColor,
  secondaryColor,
  onSelectPrimary,
  onSelectSecondary,
  onAddColor,
  onRemoveColor,
  onUpdateColor,
  onReorderColors,
  onImport,
  onExport,
  onReset,
}: PalettePanelProps) {
  const importRef = useRef<HTMLInputElement>(null);

  // Rename inline state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  // Color picker popover state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const pickedColorRef = useRef<Color | null>(null);

  // Drag-and-drop swatch reorder state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // -----------------------------------------------------------------------
  // Rename handlers
  // -----------------------------------------------------------------------

  const handleRenameStart = useCallback(() => {
    const current = palettes.find((p) => p.id === activePaletteId);
    setRenameDraft(current?.name ?? "");
    setIsRenaming(true);
  }, [palettes, activePaletteId]);

  const handleRenameCommit = useCallback(() => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenamePalette(activePaletteId, trimmed);
    }
    setIsRenaming(false);
  }, [renameDraft, activePaletteId, onRenamePalette]);

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false);
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleRenameCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleRenameCancel();
      }
    },
    [handleRenameCommit, handleRenameCancel],
  );

  // -----------------------------------------------------------------------
  // Color picker handlers
  // -----------------------------------------------------------------------

  const getInitialHex = useCallback(() => {
    if (editingIndex !== null) return colorToHex(colors[editingIndex]);
    return colorToHex(primaryColor);
  }, [editingIndex, colors, primaryColor]);

  const openPickerForAdd = useCallback(() => {
    setEditingIndex(null);
    pickedColorRef.current = null;
    setPickerOpen(true);
  }, []);

  const openPickerForEdit = useCallback((index: number) => {
    setEditingIndex(index);
    pickedColorRef.current = null;
    setPickerOpen(true);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePickerChange = useCallback((value: any) => {
    const arr = value as number[];
    pickedColorRef.current = {
      r: Math.round(arr[0]),
      g: Math.round(arr[1]),
      b: Math.round(arr[2]),
      a: Math.round((arr[3] ?? 1) * 255),
    };
  }, []);

  const handlePickerConfirm = useCallback(() => {
    const color = pickedColorRef.current;
    if (color) {
      if (editingIndex !== null) {
        onUpdateColor(editingIndex, color);
      } else {
        onAddColor(color);
      }
    }
    setPickerOpen(false);
    setEditingIndex(null);
  }, [editingIndex, onAddColor, onUpdateColor]);

  const handlePickerCancel = useCallback(() => {
    setPickerOpen(false);
    setEditingIndex(null);
  }, []);

  // -----------------------------------------------------------------------
  // Swatch click handlers
  // -----------------------------------------------------------------------

  const handleSwatchClick = useCallback(
    (color: Color, e: React.MouseEvent) => {
      e.preventDefault();
      onSelectPrimary(color);
    },
    [onSelectPrimary],
  );

  const handleSwatchContextMenu = useCallback(
    (color: Color, e: React.MouseEvent) => {
      e.preventDefault();
      onSelectSecondary(color);
    },
    [onSelectSecondary],
  );

  const selectedIndex = colors.findIndex((c) => colorsMatch(c, primaryColor));

  return (
    <TooltipProvider>
      <div className="flex flex-col w-full border-l border-border bg-card shrink-0">
        {/* Palette selector row */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-border">
          {isRenaming ? (
            <input
              autoFocus
              className="flex-1 h-6 min-w-0 text-xs px-1.5 bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameCommit}
            />
          ) : (
            <Select value={activePaletteId} onValueChange={onSwitchPalette}>
              <SelectTrigger
                className="flex-1 h-6 min-w-0 text-xs px-1.5 py-0"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {palettes.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleRenameStart}
              >
                <Pencil className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rename Palette</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDuplicatePalette(activePaletteId)}
              >
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate Palette</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDeletePalette(activePaletteId)}
                disabled={palettes.length <= 1}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Palette</TooltipContent>
          </Tooltip>
        </div>

        {/* Primary / Secondary color preview */}
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
              {/* Secondary (behind, offset) */}
              <div
                className="absolute bottom-0 right-0 w-7 h-7 rounded border border-border"
                style={{ backgroundColor: colorToHex(secondaryColor) }}
                title="Secondary color (right-click)"
              />
              {/* Primary (front) */}
              <div
                className="absolute top-0 left-0 w-7 h-7 rounded border-2 border-white shadow"
                style={{ backgroundColor: colorToHex(primaryColor) }}
                title="Primary color (left-click)"
              />
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              <div>Left Click: {colorToHex(primaryColor)}</div>
              <div>Right Click: {colorToHex(secondaryColor)}</div>
            </div>
          </div>
        </div>

        {/* Palette swatches */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-6 gap-0.5 p-1.5 w-44">
            {colors.map((color, i) => (
              <button
                key={i}
                draggable
                className={`w-5 h-5 rounded-sm border cursor-grab hover:ring-1 hover:ring-white/50 transition-shadow ${
                  i === selectedIndex
                    ? "ring-2 ring-white border-white"
                    : "border-border"
                } ${draggingIndex === i ? "opacity-40" : ""}`}
                style={{ backgroundColor: colorToHex(color) }}
                onClick={(e) => handleSwatchClick(color, e)}
                onContextMenu={(e) => handleSwatchContextMenu(color, e)}
                onDoubleClick={() => openPickerForEdit(i)}
                title={`${colorToHex(color)} (dbl-click to edit, drag to reorder)`}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(i);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingIndex !== null && draggingIndex !== i) {
                    onReorderColors(draggingIndex, i);
                  }
                  setDraggingIndex(null);
                }}
                onDragEnd={() => setDraggingIndex(null)}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex flex-wrap gap-0.5 p-1 border-t border-border">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={openPickerForAdd}
                  >
                    <Plus className="size-3" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add Color</TooltipContent>
            </Tooltip>
            <PopoverContent
              side="left"
              align="end"
              sideOffset={8}
              className="w-auto"
            >
              <ColorPicker
                defaultValue={getInitialHex()}
                onChange={handlePickerChange}
                className="w-75 gap-3"
              >
                <ColorPickerSelection className="h-40" />
                <div className="flex items-center gap-2">
                  <ColorPickerEyeDropper className="size-8" />
                  <div className="grid w-full gap-1">
                    <ColorPickerHue />
                    <ColorPickerAlpha />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ColorPickerOutput />
                  <ColorPickerFormat />
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handlePickerCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handlePickerConfirm}
                  >
                    OK
                  </Button>
                </div>
              </ColorPicker>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  if (selectedIndex >= 0) onRemoveColor(selectedIndex);
                }}
                disabled={selectedIndex < 0}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove Selected Color</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => importRef.current?.click()}
              >
                <FileUp className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import Palette File</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs">
                    <FileDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Export Palette File</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="left" align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">
                PNG Image
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("png", 1)}
              >
                PNG (1 px)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("png", 8)}
              >
                PNG (8 px)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("png", 16)}
              >
                PNG (16 px)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("png", 32)}
              >
                PNG (32 px)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">
                Palette File
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("pal")}
              >
                JASC PAL (.pal)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("ase")}
              >
                Photoshop ASE (.ase)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("aseprite")}
              >
                Aseprite (.aseprite)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("txt")}
              >
                Paint.NET (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("gpl")}
              >
                GIMP (.gpl)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => onExport("hex")}
              >
                HEX (.hex)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onReset}>
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset Active Palette to Default</TooltipContent>
          </Tooltip>
        </div>

        {/* Hidden import input */}
        <input
          ref={importRef}
          type="file"
          accept=".ase,.aseprite,.gpl,.pal,.txt,.hex,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
      </div>
    </TooltipProvider>
  );
}
