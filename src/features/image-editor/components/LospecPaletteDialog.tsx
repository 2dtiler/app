import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  filterAndSortLospecPalettes,
  syncLospecPaletteCatalog,
} from "@/features/image-editor/lib/lospec-palettes";
import type {
  LospecPaletteRecord,
  LospecPaletteSortOrder,
} from "@/features/image-editor/types";
import type { LospecPaletteDialogProps } from "@/features/image-editor/types/image-editor-ui";

function colorToCss(hex: string): string {
  return `#${hex}`;
}

function formatLospecPublishedDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Unknown date";
  }

  return new Date(parsed).toLocaleDateString();
}

function getPrimaryExampleImage(palette: LospecPaletteRecord): string | null {
  return palette.examples[0]?.image ?? null;
}

export function LospecPaletteDialog({
  open,
  onOpenChange,
  onImportPalette,
}: LospecPaletteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [palettes, setPalettes] = useState<LospecPaletteRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<LospecPaletteSortOrder>("newest");
  const [syncMessage, setSyncMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hiddenExampleIds, setHiddenExampleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage(null);
    setSyncMessage("");
    setHiddenExampleIds([]);

    void (async () => {
      const result = await syncLospecPaletteCatalog();
      if (!isCurrent) {
        return;
      }

      setPalettes(result.palettes);
      setIsLoading(false);

      if (result.status === "cache-only") {
        const message = result.errorMessage
          ? `Showing cached Lospec palettes. ${result.errorMessage}`
          : "Showing cached Lospec palettes.";
        setSyncMessage(message);
        toast(message);
        return;
      }

      if (result.status === "error") {
        const message =
          result.errorMessage ?? "Lospec palettes could not be loaded.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      setSyncMessage(
        result.addedCount > 0
          ? `Imported ${result.addedCount} new Lospec palettes into local IndexedDB.`
          : "Lospec palette library is already up to date.",
      );
    })();

    return () => {
      isCurrent = false;
    };
  }, [open]);

  const filteredPalettes = filterAndSortLospecPalettes(palettes, {
    query,
    sortOrder,
  });

  const handleImport = (palette: LospecPaletteRecord) => {
    onImportPalette(palette);
    onOpenChange(false);
    toast.success(`Imported ${palette.title}`);
  };

  const hideExampleImage = (paletteId: string) => {
    setHiddenExampleIds((current) =>
      current.includes(paletteId) ? current : [...current, paletteId],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
        <div className="flex h-[90vh] max-h-[48rem] min-h-0 flex-col">
          <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
            <DialogTitle>Import from Lospec</DialogTitle>
            <DialogDescription>
              Sync the Lospec palette catalog into local IndexedDB, then search,
              sort, preview, and import palettes into the Image/Sprite Editor.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-3 px-6 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Importing Lospec palettes...</span>
            </div>
          ) : errorMessage && palettes.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
                {errorMessage}
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-border px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1.5">
                    <label
                      htmlFor="lospec-palette-search"
                      className="text-xs font-medium text-foreground"
                    >
                      Search by tags
                    </label>
                    <Input
                      id="lospec-palette-search"
                      name="lospec-palette-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by tag, title, user, or description"
                    />
                  </div>
                  <div className="space-y-1.5 sm:w-52">
                    <label
                      htmlFor="lospec-palette-sort"
                      className="text-xs font-medium text-foreground"
                    >
                      Order
                    </label>
                    <select
                      id="lospec-palette-sort"
                      name="lospec-palette-sort"
                      value={sortOrder}
                      onChange={(event) =>
                        setSortOrder(
                          event.target.value as LospecPaletteSortOrder,
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="newest">Newest to Oldest</option>
                      <option value="alphabetical">A-Z</option>
                    </select>
                  </div>
                </div>
                <div className="pt-3 text-xs text-muted-foreground">
                  {syncMessage || `Loaded ${palettes.length} Lospec palettes.`}
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                  {filteredPalettes.map((palette) => {
                    const exampleImage = getPrimaryExampleImage(palette);
                    const showExample =
                      !!exampleImage && !hiddenExampleIds.includes(palette.id);

                    return (
                      <article
                        key={palette.id}
                        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                      >
                        {showExample ? (
                          <img
                            src={exampleImage ?? undefined}
                            alt={`${palette.title} example artwork`}
                            className="h-40 w-full object-cover"
                            loading="lazy"
                            onError={() => hideExampleImage(palette.id)}
                          />
                        ) : (
                          <div className="flex h-40 items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                            Example artwork unavailable
                          </div>
                        )}

                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-foreground">
                                {palette.title}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                by {palette.user || "Unknown artist"}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="shrink-0"
                              onClick={() => handleImport(palette)}
                            >
                              Import
                            </Button>
                          </div>

                          {palette.description ? (
                            <p className="text-xs leading-5 text-muted-foreground">
                              {palette.description}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap gap-1.5">
                            {palette.colorHexes
                              .slice(0, 12)
                              .map((hex, index) => (
                                <span
                                  key={`${palette.id}-${hex}-${index}`}
                                  aria-label={`Palette swatch ${hex}`}
                                  className="h-5 w-5 rounded-md border border-border"
                                  style={{ backgroundColor: colorToCss(hex) }}
                                />
                              ))}
                            {palette.colorHexes.length > 12 ? (
                              <span className="flex h-5 items-center rounded-md border border-border px-1.5 text-[10px] text-muted-foreground">
                                +{palette.colorHexes.length - 12}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {palette.tags.map((tag) => (
                              <span
                                key={`${palette.id}-${tag}`}
                                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{palette.colors.length} colors</span>
                            <span>
                              {formatLospecPublishedDate(palette.publishedAt)}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {filteredPalettes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground sm:col-span-2">
                      No Lospec palettes match the current search.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </>
          )}

          <DialogFooter
            className="border-t border-border px-6 py-4"
            showCloseButton
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
