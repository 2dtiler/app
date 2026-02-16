import { useRef, useCallback, useState } from "react";
import { Plus, Trash2, FileDown, FileUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/kibo-ui/color-picker";
import type { Color } from "@/types/image-editor";

interface PalettePanelProps {
  colors: Color[];
  primaryColor: Color;
  secondaryColor: Color;
  onSelectPrimary: (color: Color) => void;
  onSelectSecondary: (color: Color) => void;
  onAddColor: (color: Color) => void;
  onRemoveColor: (index: number) => void;
  onUpdateColor: (index: number, color: Color) => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onReset: () => void;
}

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
  colors,
  primaryColor,
  secondaryColor,
  onSelectPrimary,
  onSelectSecondary,
  onAddColor,
  onRemoveColor,
  onUpdateColor,
  onImport,
  onExport,
  onReset,
}: PalettePanelProps) {
  const importRef = useRef<HTMLInputElement>(null);

  // Color picker popover state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const pickedColorRef = useRef<Color | null>(null);

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
      <div className="flex flex-col w-44 border-l border-border bg-card shrink-0">
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
              <div>L: {colorToHex(primaryColor)}</div>
              <div>R: {colorToHex(secondaryColor)}</div>
            </div>
          </div>
        </div>

        {/* Palette swatches */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-6 gap-0.5 p-1.5">
            {colors.map((color, i) => (
              <button
                key={i}
                className={`w-5 h-5 rounded-sm border cursor-pointer hover:ring-1 hover:ring-white/50 transition-shadow ${
                  i === selectedIndex
                    ? "ring-2 ring-white border-white"
                    : "border-border"
                }`}
                style={{ backgroundColor: colorToHex(color) }}
                onClick={(e) => handleSwatchClick(color, e)}
                onContextMenu={(e) => handleSwatchContextMenu(color, e)}
                onDoubleClick={() => openPickerForEdit(i)}
                title={`${colorToHex(color)} (dbl-click to edit)`}
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
                className="w-56 gap-3"
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
            <TooltipContent>Import .ase Palette</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onExport}>
                <FileDown className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export .ase Palette</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onReset}>
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to Default Palette</TooltipContent>
          </Tooltip>
        </div>

        {/* Hidden inputs */}
        <input
          ref={importRef}
          type="file"
          accept=".ase,.aseprite"
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
