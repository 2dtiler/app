import type { FocusEvent, KeyboardEvent } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Input } from "@/components/ui/Input";
import { useEditorStore } from "@/hooks/use-editor-store";

function clampDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ImageLayerPropertiesPanel() {
  const { state, setState } = useEditorStore();
  const project = state.project;
  const activeImageLayer =
    project?.imageLayers?.find((layer) => layer.id === state.activeLayerId) ??
    null;

  function updateImageLayer(
    updater: (layer: NonNullable<typeof activeImageLayer>) => void,
  ) {
    if (!activeImageLayer) return;

    setState((draft) => {
      const layer = (draft.project?.imageLayers ?? []).find(
        (entry) => entry.id === activeImageLayer.id,
      );
      if (!layer) return;
      updater(layer);
    });
  }

  function commitWidth(value: string): string {
    if (!activeImageLayer) return "";
    const parsed = Number.parseInt(value, 10);
    const nextWidth = Number.isFinite(parsed)
      ? clampDimension(parsed)
      : activeImageLayer.width;

    if (nextWidth !== activeImageLayer.width) {
      updateImageLayer((layer) => {
        layer.width = nextWidth;
      });
    }

    return String(nextWidth);
  }

  function commitHeight(value: string): string {
    if (!activeImageLayer) return "";
    const parsed = Number.parseInt(value, 10);
    const nextHeight = Number.isFinite(parsed)
      ? clampDimension(parsed)
      : activeImageLayer.height;

    if (nextHeight !== activeImageLayer.height) {
      updateImageLayer((layer) => {
        layer.height = nextHeight;
      });
    }

    return String(nextHeight);
  }

  function commitOpacity(value: string): string {
    if (!activeImageLayer) return "";
    const parsed = Number.parseInt(value, 10);
    const nextOpacity = Number.isFinite(parsed)
      ? clampOpacity(parsed)
      : (activeImageLayer.opacity ?? 100);

    if (nextOpacity !== (activeImageLayer.opacity ?? 100)) {
      updateImageLayer((layer) => {
        layer.opacity = nextOpacity;
      });
    }

    return String(nextOpacity);
  }

  function handleInputKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    commit: (value: string) => string,
    resetValue: string,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.value = commit(e.currentTarget.value);
      e.currentTarget.blur();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = resetValue;
      e.currentTarget.blur();
    }
  }

  if (!project) return null;

  if (!activeImageLayer) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-card px-2 py-1 shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Image Properties
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
          Select an image layer
        </div>
      </div>
    );
  }

  const defaultWidth = String(activeImageLayer.width);
  const defaultHeight = String(activeImageLayer.height);
  const defaultOpacity = String(activeImageLayer.opacity ?? 100);

  function handleWidthBlur(e: FocusEvent<HTMLInputElement>) {
    e.currentTarget.value = commitWidth(e.currentTarget.value);
  }

  function handleHeightBlur(e: FocusEvent<HTMLInputElement>) {
    e.currentTarget.value = commitHeight(e.currentTarget.value);
  }

  function handleOpacityBlur(e: FocusEvent<HTMLInputElement>) {
    e.currentTarget.value = commitOpacity(e.currentTarget.value);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border bg-card px-2 py-1 shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Image Properties
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          <p className="text-xs text-muted-foreground">
            {activeImageLayer.locked
              ? "Unlock this layer to edit its transform and rendering settings."
              : "Adjust how this image layer is rendered on the map."}
          </p>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Image layer properties</caption>
              <tbody className="divide-y divide-border">
                <tr className="align-middle">
                  <th
                    id="image-layer-width-label"
                    scope="row"
                    className="w-32 bg-card/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    Width
                  </th>
                  <td className="px-3 py-2">
                    <Input
                      key={`${activeImageLayer.id}-width-${activeImageLayer.width}`}
                      id="image-layer-width"
                      name="imageLayerWidth"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      aria-labelledby="image-layer-width-label"
                      disabled={activeImageLayer.locked}
                      defaultValue={defaultWidth}
                      onBlur={handleWidthBlur}
                      onKeyDown={(e) =>
                        handleInputKeyDown(e, commitWidth, defaultWidth)
                      }
                    />
                  </td>
                </tr>

                <tr className="align-middle">
                  <th
                    id="image-layer-height-label"
                    scope="row"
                    className="w-32 bg-card/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    Height
                  </th>
                  <td className="px-3 py-2">
                    <Input
                      key={`${activeImageLayer.id}-height-${activeImageLayer.height}`}
                      id="image-layer-height"
                      name="imageLayerHeight"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      aria-labelledby="image-layer-height-label"
                      disabled={activeImageLayer.locked}
                      defaultValue={defaultHeight}
                      onBlur={handleHeightBlur}
                      onKeyDown={(e) =>
                        handleInputKeyDown(e, commitHeight, defaultHeight)
                      }
                    />
                  </td>
                </tr>

                <tr className="align-middle">
                  <th
                    id="image-layer-opacity-label"
                    scope="row"
                    className="w-32 bg-card/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    Opacity
                  </th>
                  <td className="space-y-2 px-3 py-2">
                    <Input
                      key={`${activeImageLayer.id}-opacity-${activeImageLayer.opacity ?? 100}`}
                      id="image-layer-opacity"
                      name="imageLayerOpacity"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      aria-labelledby="image-layer-opacity-label"
                      disabled={activeImageLayer.locked}
                      defaultValue={defaultOpacity}
                      onBlur={handleOpacityBlur}
                      onKeyDown={(e) =>
                        handleInputKeyDown(e, commitOpacity, defaultOpacity)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Set a value from 0% to 100%.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
