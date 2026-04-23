import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";
import { Switch } from "@/components/ui/Switch";
import {
  PROPERTY_TYPES,
  TEXT_OBJECT_PROPERTY_KEYS,
  type PropertyType,
  type PropertyValue,
  type TextObjectEditableFields,
  type TextObjectFontOption,
} from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  buildTextObjectPatch,
  getTextObjectEditableFields,
  isReservedTextObjectPropertyKey,
  isTextObject,
} from "@/features/map-editor/lib/text-objects";
import {
  canQueryLocalFonts,
  FONT_FAMILY_PRESETS,
  loadLocalFontFamilies,
} from "@/services/local-fonts";
import type {
  EditablePropertyEntry,
  ObjectPropertiesDialogProps,
} from "@/features/map-editor/types/dialogs";

function objectPropertiesToEntries(
  properties: Record<string, PropertyValue>,
  includeEntry?: (key: string) => boolean,
): EditablePropertyEntry[] {
  return Object.entries(properties ?? {})
    .filter(([key]) => includeEntry?.(key) ?? true)
    .map(([key, propertyValue]) => ({
      key,
      value:
        typeof propertyValue === "string" ? propertyValue : propertyValue.value,
      type: typeof propertyValue === "string" ? "string" : propertyValue.type,
    }));
}

function buildPropertyRecord(
  entries: EditablePropertyEntry[],
): Record<string, PropertyValue> {
  const properties: Record<string, PropertyValue> = {};

  for (const { key, value, type } of entries) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    properties[trimmedKey] = { value, type };
  }

  return properties;
}

export function ObjectPropertiesDialog({
  open,
  onOpenChange,
  object,
  onSave,
}: ObjectPropertiesDialogProps) {
  const [name, setName] = useState(object.name);
  const [entries, setEntries] = useState<EditablePropertyEntry[]>(() =>
    objectPropertiesToEntries(object.properties, (key) =>
      isTextObject(object) ? !isReservedTextObjectPropertyKey(key) : true,
    ),
  );
  const [textFields, setTextFields] = useState<TextObjectEditableFields | null>(
    () => (isTextObject(object) ? getTextObjectEditableFields(object) : null),
  );
  const [fontOptions, setFontOptions] =
    useState<TextObjectFontOption[]>(FONT_FAMILY_PRESETS);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [loadingLocalFonts, setLoadingLocalFonts] = useState(false);

  function handleAddProperty() {
    setEntries((prev) => [
      ...prev,
      { key: "", value: "", type: "string" as PropertyType },
    ]);
  }

  function handleRemoveProperty(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, key: value } : e)),
    );
  }

  function handleValueChange(index: number, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, value: value } : e)),
    );
  }

  function handleTypeChange(index: number, type: PropertyType) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, type } : e)),
    );
  }

  function handleTextFieldChange<K extends keyof TextObjectEditableFields>(
    key: K,
    value: TextObjectEditableFields[K],
  ) {
    setTextFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleLoadLocalFonts() {
    if (!canQueryLocalFonts()) {
      setFontLoadError(
        "Installed font browsing is unavailable in this browser. Enter a font family manually instead.",
      );
      return;
    }

    setLoadingLocalFonts(true);
    setFontLoadError(null);
    try {
      const localFonts = await loadLocalFontFamilies();
      if (localFonts.length === 0) {
        setFontLoadError("No installed fonts were returned by the browser.");
        return;
      }

      const merged = new Map<string, TextObjectFontOption>();
      for (const font of [...FONT_FAMILY_PRESETS, ...localFonts]) {
        if (!merged.has(font.family)) {
          merged.set(font.family, font);
        }
      }
      setFontOptions([...merged.values()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setFontLoadError(`Could not load installed fonts: ${message}`);
    } finally {
      setLoadingLocalFonts(false);
    }
  }

  function handleSave() {
    const customProperties = buildPropertyRecord(entries);

    if (isTextObject(object) && textFields) {
      const patch = buildTextObjectPatch(object, textFields);
      const reservedProperties: Record<string, PropertyValue> = {};
      for (const key of Object.values(TEXT_OBJECT_PROPERTY_KEYS)) {
        const propertyValue = patch.properties?.[key];
        if (propertyValue) {
          reservedProperties[key] = propertyValue;
        }
      }
      onSave(
        {
          ...customProperties,
          ...reservedProperties,
        },
        name.trim() || object.name,
      );
      return;
    }

    onSave(customProperties, name.trim() || object.name);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>Object Properties</DialogTitle>
          <DialogDescription>
            Edit the name and custom properties of this {object.type} object.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Object name */}
          <div className="space-y-1">
            <Label htmlFor="object-name" className="text-xs">
              Name
            </Label>
            <Input
              id="object-name"
              name="object-name"
              aria-label="Object name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Read-only type info */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Type: <strong className="text-foreground">{object.type}</strong>
            </span>
            <span>
              Position: ({Math.round(object.x)}, {Math.round(object.y)})
            </span>
            {object.type !== "point" && (
              <span>
                Size: {Math.round(object.width)} × {Math.round(object.height)}
              </span>
            )}
          </div>

          <Separator />

          {textFields && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="text-object-text" className="text-xs">
                  Text
                </Label>
                <textarea
                  id="text-object-text"
                  name="text-object-text"
                  aria-label="Text object content"
                  value={textFields.text}
                  onChange={(event) =>
                    handleTextFieldChange("text", event.target.value)
                  }
                  rows={4}
                  className="flex min-h-24 w-full rounded-xl border border-input bg-transparent px-3 py-2 font-mono text-sm tracking-[0.02em] text-foreground outline-none transition-colors placeholder:text-text-disabled focus-visible:border-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="text-object-size" className="text-xs">
                    Size (px)
                  </Label>
                  <Input
                    id="text-object-size"
                    name="text-object-size"
                    aria-label="Text object font size"
                    type="number"
                    min={1}
                    value={textFields.size}
                    onChange={(event) =>
                      handleTextFieldChange("size", event.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="text-object-rotation" className="text-xs">
                    Rotation (degrees)
                  </Label>
                  <Input
                    id="text-object-rotation"
                    name="text-object-rotation"
                    aria-label="Text object rotation"
                    type="number"
                    value={textFields.rotation}
                    onChange={(event) =>
                      handleTextFieldChange("rotation", event.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="text-object-font" className="text-xs">
                    Font
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onMouseDown={handleLoadLocalFonts}
                  >
                    {loadingLocalFonts
                      ? "Loading fonts..."
                      : "Browse installed fonts"}
                  </Button>
                </div>
                <Input
                  id="text-object-font"
                  name="text-object-font"
                  aria-label="Text object font family"
                  value={textFields.font}
                  onChange={(event) =>
                    handleTextFieldChange("font", event.target.value)
                  }
                  className="h-8 text-xs"
                />
                <Select
                  name="text-object-font-preset"
                  value={
                    fontOptions.some(
                      (option) => option.family === textFields.font,
                    )
                      ? textFields.font
                      : "__custom__"
                  }
                  onValueChange={(value) => {
                    if (value !== "__custom__") {
                      handleTextFieldChange("font", value);
                    }
                  }}
                >
                  <SelectTrigger
                    id="text-object-font-preset"
                    aria-label="Text object installed font selection"
                    className="h-8 text-xs"
                  >
                    <SelectValue placeholder="Select a font family" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__" className="text-xs">
                      Manual / custom font family
                    </SelectItem>
                    {fontOptions.map((option) => (
                      <SelectItem
                        key={option.family}
                        value={option.family}
                        className="text-xs"
                      >
                        {option.family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Installed font browsing currently works only in supporting
                  Chromium browsers. Other browsers can still use a manual font
                  family string.
                </p>
                {fontLoadError && (
                  <p className="text-[11px] text-destructive">
                    {fontLoadError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="space-y-1">
                  <Label htmlFor="text-object-word-wrap" className="text-xs">
                    Word Wrap
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Resizing changes the text box only. Font size stays fixed.
                  </p>
                </div>
                <Switch
                  id="text-object-word-wrap"
                  name="text-object-word-wrap"
                  aria-label="Toggle text object word wrap"
                  checked={textFields.wordWrap}
                  onCheckedChange={(checked) =>
                    handleTextFieldChange("wordWrap", Boolean(checked))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="text-object-color" className="text-xs">
                  Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id="text-object-color"
                    name="text-object-color"
                    aria-label="Text object color"
                    type="color"
                    value={textFields.color}
                    onChange={(event) =>
                      handleTextFieldChange("color", event.target.value)
                    }
                    className="h-8 w-12 rounded border border-input bg-transparent p-1"
                  />
                  <Input
                    id="text-object-color-value"
                    name="text-object-color-value"
                    aria-label="Text object color value"
                    value={textFields.color}
                    onChange={(event) =>
                      handleTextFieldChange("color", event.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <Separator />
            </div>
          )}

          {/* Custom properties */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Custom Properties</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onMouseDown={handleAddProperty}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>

            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No custom properties. Click &quot;Add&quot; to create one.
              </p>
            )}

            {entries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  id={`property-key-${idx}`}
                  name={`property-key-${idx}`}
                  aria-label={`Object property ${idx + 1} key`}
                  placeholder="Key"
                  value={entry.key}
                  onChange={(e) => handleKeyChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Select
                  name={`property-type-${idx}`}
                  value={entry.type}
                  onValueChange={(v) =>
                    handleTypeChange(idx, v as PropertyType)
                  }
                >
                  <SelectTrigger
                    id={`property-type-${idx}`}
                    aria-label={`Object property ${idx + 1} type`}
                    className="w-22 h-7 text-xs shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id={`property-value-${idx}`}
                  name={`property-value-${idx}`}
                  aria-label={`Object property ${idx + 1} value`}
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => handleValueChange(idx, e.target.value)}
                  className="flex-2 min-w-0 h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove object property ${idx + 1}`}
                  className="h-7 w-7 text-destructive shrink-0"
                  onMouseDown={() => handleRemoveProperty(idx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onMouseDown={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
