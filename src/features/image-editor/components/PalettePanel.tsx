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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/Tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  ColorPicker,
  ColorPickerSelection,
  ColorPickerHue,
  ColorPickerEyeDropper,
  ColorPickerOutput,
  ColorPickerFormat,
} from "@/components/ui/ColorPicker";
import type { Color } from "@/features/image-editor/types";
import type { PalettePanelProps } from "@/features/image-editor/types/image-editor-ui";

function colorToHex(color: Color): string {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function colorToCss(color: Color): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

function colorsMatch(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function toOpacityPercent(color: Color): number {
  return Math.round((color.a / 255) * 100);
}

function clampOpacityPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function PalettePanel({
  palettes,
  activePaletteId,
  onSwitchPalette,
  onOpenLospecDialog,
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

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const pickedColorRef = useRef<Color | null>(null);

  const handleRenameStart = useCallback(() => {
    const current = palettes.find((palette) => palette.id === activePaletteId);
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
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRenameCommit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleRenameCancel();
      }
    },
    [handleRenameCommit, handleRenameCancel],
  );

  const getInitialHex = useCallback(() => {
    if (editingIndex !== null) {
      return colorToHex(colors[editingIndex]!);
    }
    return colorToHex(primaryColor);
  }, [editingIndex, colors, primaryColor]);

  const openPickerForAdd = useCallback(() => {
    pickedColorRef.current = { ...primaryColor, a: 255 };
    setEditingIndex(null);
    setPickerOpen(true);
  }, [primaryColor]);

  const openPickerForEdit = useCallback(
    (index: number) => {
      const baseColor = colors[index]!;
      pickedColorRef.current = { ...baseColor, a: 255 };
      setEditingIndex(index);
      setPickerOpen(true);
    },
    [colors],
  );

  const handlePickerChange = useCallback((value: number[]) => {
    const rgba = value;
    pickedColorRef.current = {
      r: Math.round(rgba[0]),
      g: Math.round(rgba[1]),
      b: Math.round(rgba[2]),
      a: 255,
    };
  }, []);

  const handlePrimaryOpacityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextOpacity = clampOpacityPercent(Number(event.target.value));
      onSelectPrimary({
        ...primaryColor,
        a: Math.round((nextOpacity / 100) * 255),
      });
    },
    [onSelectPrimary, primaryColor],
  );

  const handleSecondaryOpacityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextOpacity = clampOpacityPercent(Number(event.target.value));
      onSelectSecondary({
        ...secondaryColor,
        a: Math.round((nextOpacity / 100) * 255),
      });
    },
    [onSelectSecondary, secondaryColor],
  );

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

  const handleSwatchClick = useCallback(
    (color: Color, event: React.MouseEvent) => {
      event.preventDefault();
      onSelectPrimary(color);
    },
    [onSelectPrimary],
  );

  const handleSwatchContextMenu = useCallback(
    (color: Color, event: React.MouseEvent) => {
      event.preventDefault();
      onSelectSecondary(color);
    },
    [onSelectSecondary],
  );

  const selectedIndex = colors.findIndex((color) =>
    colorsMatch(color, primaryColor),
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col w-full border-l border-border bg-card shrink-0">
        <div className="flex items-center gap-0.5 p-1.5 border-b border-border">
          {isRenaming ? (
            <input
              id="palette-rename-input"
              name="palette-rename-input"
              autoFocus
              className="flex-1 h-6 min-w-0 text-xs px-1.5 bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameCommit}
            />
          ) : (
            <Select value={activePaletteId} onValueChange={onSwitchPalette}>
              <SelectTrigger
                aria-label="Active Palette"
                className="flex-1 h-6 min-w-0 text-xs px-1.5 py-0"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {palettes.map((palette) => (
                  <SelectItem
                    key={palette.id}
                    value={palette.id}
                    className="text-xs"
                  >
                    {palette.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Rename Palette"
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
                aria-label="Duplicate Palette"
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
                aria-label="Delete Palette"
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

          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 px-2 text-[10px]"
            onClick={onOpenLospecDialog}
          >
            Import from Lospec
          </Button>
        </div>

        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
              <div
                className="absolute bottom-0 right-0 w-7 h-7 rounded border border-border"
                style={{ backgroundColor: colorToCss(secondaryColor) }}
                title="Secondary color (right-click)"
              />
              <div
                className="absolute top-0 left-0 w-7 h-7 rounded border-2 border-white shadow"
                style={{ backgroundColor: colorToCss(primaryColor) }}
                title="Primary color (left-click)"
              />
            </div>
            <div className="flex-1 space-y-1 text-[10px] text-muted-foreground leading-tight">
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-1.5">
                <span>Left Click</span>
                <span className="truncate uppercase">
                  {colorToHex(primaryColor)}
                </span>
                <Input
                  id="primary-color-opacity"
                  name="primary-color-opacity"
                  type="number"
                  min={0}
                  max={100}
                  value={toOpacityPercent(primaryColor)}
                  onChange={handlePrimaryOpacityChange}
                  className="h-6 w-14 px-1.5 text-[10px]"
                />
                <span>%</span>
              </div>
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-1.5">
                <span>Right Click</span>
                <span className="truncate uppercase">
                  {colorToHex(secondaryColor)}
                </span>
                <Input
                  id="secondary-color-opacity"
                  name="secondary-color-opacity"
                  type="number"
                  min={0}
                  max={100}
                  value={toOpacityPercent(secondaryColor)}
                  onChange={handleSecondaryOpacityChange}
                  className="h-6 w-14 px-1.5 text-[10px]"
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-6 gap-0.5 p-1.5 w-44">
            {colors.map((color, index) => (
              <button
                key={index}
                draggable
                type="button"
                aria-label={`Palette color ${index + 1}: ${colorToHex(color)}`}
                className={`w-5 h-5 rounded-sm border hover:ring-1 hover:ring-white/50 transition-shadow ${
                  index === selectedIndex
                    ? "ring-2 ring-white border-white"
                    : "border-border"
                } ${draggingIndex === index ? "cursor-grabbing opacity-40" : "cursor-pointer"}`}
                style={{ backgroundColor: colorToHex(color) }}
                onClick={(event) => handleSwatchClick(color, event)}
                onContextMenu={(event) => handleSwatchContextMenu(color, event)}
                onDoubleClick={() => openPickerForEdit(index)}
                title={`${colorToHex(color)} (dbl-click to edit, drag to reorder)`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingIndex !== null && draggingIndex !== index) {
                    onReorderColors(draggingIndex, index);
                  }
                  setDraggingIndex(null);
                }}
                onDragEnd={() => setDraggingIndex(null)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-0.5 p-1 border-t border-border">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    aria-label="Add Color"
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
                aria-label="Remove Selected Color"
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
                aria-label="Import Palette File"
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
                  <Button
                    aria-label="Export Palette File"
                    variant="ghost"
                    size="icon-xs"
                  >
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
              <Button
                aria-label="Reset Active Palette to Default"
                variant="ghost"
                size="icon-xs"
                onClick={onReset}
              >
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset Active Palette to Default</TooltipContent>
          </Tooltip>
        </div>

        <input
          ref={importRef}
          id="palette-import-input"
          name="palette-import-input"
          type="file"
          accept=".ase,.aseprite,.gpl,.pal,.txt,.hex,.png"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = "";
          }}
        />
      </div>
    </TooltipProvider>
  );
}
