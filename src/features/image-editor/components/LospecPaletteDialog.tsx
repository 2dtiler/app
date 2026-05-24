import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { filterAndSortLospecPalettes } from "@/features/image-editor/lib/lospec-palettes";
import { startLospecPaletteBackgroundSync } from "@/features/image-editor/lib/lospec-sync-controller";
import { useLospecPaletteSync } from "@/features/image-editor/hooks/use-lospec-palette-sync";
import { saveLospecPaletteSyncEnabled } from "@/services/db";
import type {
  LospecPaletteRecord,
  LospecPaletteSortOrder,
  LospecPaletteSyncSnapshot,
} from "@/features/image-editor/types";
import type { LospecPaletteDialogProps } from "@/features/image-editor/types/image-editor-ui";

const LOSPEC_DIALOG_PAGE_SIZE = 24;
const LOSPEC_COLOR_PREVIEW_LIMIT = 12;

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

function getLospecSyncMessage(sync: LospecPaletteSyncSnapshot): string {
  if (!sync.hasLoaded) {
    return "Checking Lospec palette library...";
  }

  if (sync.status === "syncing") {
    if (sync.fetchedPageCount === 0 && sync.palettes.length > 0) {
      return `Loaded ${sync.palettes.length} cached Lospec palettes. Syncing historical Lospec pages...`;
    }

    return sync.addedCount > 0
      ? `Imported ${sync.addedCount} new Lospec palettes. Syncing page ${sync.nextPage}...`
      : `Checked ${sync.fetchedPageCount} Lospec pages. Syncing page ${sync.nextPage}...`;
  }

  if (sync.status === "rate-limited") {
    return "Lospec sync is waiting for the rate limit window to clear.";
  }

  if (sync.status === "error") {
    return sync.errorMessage ?? "Lospec palettes could not be loaded.";
  }

  if (sync.status === "complete") {
    return sync.addedCount > 0
      ? `Imported ${sync.addedCount} Lospec palettes into local IndexedDB.`
      : sync.palettes.length > 0
        ? "Lospec palette library is ready."
        : "No Lospec palettes were found.";
  }

  return sync.palettes.length > 0
    ? `Loaded ${sync.palettes.length} Lospec palettes.`
    : "Checking Lospec palette library...";
}

export function LospecPaletteDialog({
  open,
  onOpenChange,
  onImportPalette,
}: LospecPaletteDialogProps) {
  const sync = useLospecPaletteSync();
  const resultsScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<LospecPaletteSortOrder>("newest");
  const [hiddenExampleIds, setHiddenExampleIds] = useState<string[]>([]);
  const [expandedColorPaletteIds, setExpandedColorPaletteIds] = useState<
    string[]
  >([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [retryNowMs, setRetryNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      return;
    }

    saveLospecPaletteSyncEnabled(true);
    void startLospecPaletteBackgroundSync();
    setHiddenExampleIds([]);
    setExpandedColorPaletteIds([]);
    setCurrentPage(1);
  }, [open]);

  useEffect(() => {
    if (!open || sync.retryAtMs === null) {
      return;
    }

    setRetryNowMs(Date.now());
    const retryIntervalId = window.setInterval(() => {
      setRetryNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(retryIntervalId);
    };
  }, [open, sync.retryAtMs]);

  const palettes = sync.palettes;
  const isSyncing = sync.status === "syncing";
  const isLoading =
    !sync.hasLoaded || (sync.status === "syncing" && palettes.length === 0);
  const errorMessage =
    sync.status === "error"
      ? sync.errorMessage ?? "Lospec palettes could not be loaded."
      : null;
  const syncMessage = getLospecSyncMessage(sync);
  const retrySeconds =
    sync.retryAtMs === null
      ? null
      : Math.max(0, Math.ceil((sync.retryAtMs - retryNowMs) / 1000));

  const filteredPalettes = filterAndSortLospecPalettes(palettes, {
    query,
    sortOrder,
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPalettes.length / LOSPEC_DIALOG_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * LOSPEC_DIALOG_PAGE_SIZE;
  const paginatedPalettes = filteredPalettes.slice(
    pageStartIndex,
    pageStartIndex + LOSPEC_DIALOG_PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, sortOrder]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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

  const handleTagClick = (tag: string) => {
    setQuery(tag);
    setCurrentPage(1);
  };

  const handleShowAllColors = (paletteId: string) => {
    setExpandedColorPaletteIds((current) =>
      current.includes(paletteId) ? current : [...current, paletteId],
    );
  };

  const scrollResultsToTop = () => {
    const viewport = resultsScrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!(viewport instanceof HTMLDivElement)) {
      return;
    }

    viewport.scrollTo({ top: 0, behavior: "auto" });
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
    scrollResultsToTop();
  };

  const handleNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
    scrollResultsToTop();
  };

  const handleCopyColor = async (hex: string) => {
    const value = colorToCss(hex);

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${value}`);
    } catch {
      toast.error("Color could not be copied.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
        <TooltipProvider>
          <div className="flex h-[90vh] max-h-[48rem] min-h-0 flex-col">
            <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
              <DialogTitle>Import from Lospec</DialogTitle>
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
                  <div
                    className="flex items-center gap-2 pt-3 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {isSyncing ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                    ) : null}
                    <span>
                      {syncMessage ||
                        `Loaded ${palettes.length} Lospec palettes.`}
                      {retrySeconds !== null
                        ? ` Retrying in ${retrySeconds}s.`
                        : ""}
                    </span>
                  </div>
                </div>

                <ScrollArea
                  ref={resultsScrollAreaRef}
                  className="min-h-0 flex-1"
                >
                  <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                    {paginatedPalettes.map((palette) => {
                      const exampleImage = getPrimaryExampleImage(palette);
                      const showExample =
                        !!exampleImage &&
                        !hiddenExampleIds.includes(palette.id);
                      const showAllColors = expandedColorPaletteIds.includes(
                        palette.id,
                      );
                      const visibleColorHexes = showAllColors
                        ? palette.colorHexes
                        : palette.colorHexes.slice(
                            0,
                            LOSPEC_COLOR_PREVIEW_LIMIT,
                          );
                      const hiddenColorCount =
                        palette.colorHexes.length - visibleColorHexes.length;

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
                              <p className="text-xs leading-5 whitespace-pre-line text-muted-foreground">
                                {palette.description}
                              </p>
                            ) : null}

                            <div className="flex min-h-5 flex-wrap gap-1.5">
                              {visibleColorHexes.map((hex, index) => (
                                <Tooltip key={`${palette.id}-${hex}-${index}`}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`Copy color ${colorToCss(hex)}`}
                                      className="h-5 w-5 rounded-md border border-border outline-none transition-transform hover:scale-110 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                      style={{
                                        backgroundColor: colorToCss(hex),
                                      }}
                                      onClick={() => void handleCopyColor(hex)}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent className="select-text tracking-normal normal-case">
                                    {colorToCss(hex)}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                              {hiddenColorCount > 0 ? (
                                <button
                                  type="button"
                                  aria-label={`Show all ${palette.colorHexes.length} colors in ${palette.title}`}
                                  className="flex h-5 items-center rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:border-border-visible hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                                  onClick={() =>
                                    handleShowAllColors(palette.id)
                                  }
                                >
                                  +{hiddenColorCount}
                                </button>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {palette.tags.map((tag) => (
                                <button
                                  key={`${palette.id}-${tag}`}
                                  type="button"
                                  aria-label={`Search Lospec palettes tagged ${tag}`}
                                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-border-visible hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                                  onClick={() => handleTagClick(tag)}
                                >
                                  {tag}
                                </button>
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
              className="items-center border-t border-border px-6 py-4 sm:justify-between"
              showCloseButton
            >
              {filteredPalettes.length > 0 ? (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label="Previous Lospec palette page"
                      disabled={safeCurrentPage <= 1}
                      onClick={handlePreviousPage}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label="Next Lospec palette page"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={handleNextPage}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                  <span>
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                </div>
              ) : (
                <span />
              )}
            </DialogFooter>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
