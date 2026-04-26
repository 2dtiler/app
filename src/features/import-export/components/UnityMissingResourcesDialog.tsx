import { FileSearch, FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { UnityMissingResourcesDialogProps } from "@/features/import-export/types";

export function UnityMissingResourcesDialog({
  open,
  onOpenChange,
  resources,
  selectedFileNames,
  isSubmitting,
  onSelectFile,
  onImport,
}: UnityMissingResourcesDialogProps) {
  const hasAllSelections =
    resources.length > 0 &&
    resources.every((resource) => Boolean(selectedFileNames[resource.path]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Resolve linked Unity resources</DialogTitle>
          <DialogDescription>
            Select the missing Unity-linked files referenced by this import,
            including manifests, Tile assets, `.meta` sidecars, and texture
            images. If a chosen file links to more resources, this list will
            update after you continue.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-112 pr-4">
          <div className="space-y-3">
            {resources.map((resource) => {
              const selectedFileName = selectedFileNames[resource.path];

              return (
                <section
                  key={resource.path}
                  className="rounded-2xl border border-border-visible bg-secondary/35 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                        <FileSearch className="size-3.5" />
                        <span>{resource.label}</span>
                      </div>
                      <p className="font-mono text-sm text-foreground">
                        {resource.path}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Referenced by {resource.referringPath}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedFileName
                          ? `Selected: ${selectedFileName}`
                          : "No file selected yet."}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => void onSelectFile(resource)}
                      disabled={isSubmitting}
                    >
                      <FileUp />
                      {selectedFileName ? "Replace file" : "Choose file"}
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter showCloseButton={!isSubmitting}>
          <Button
            onClick={() => void onImport()}
            disabled={!hasAllSelections || isSubmitting}
          >
            {isSubmitting ? "Importing..." : "Continue import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
