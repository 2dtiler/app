import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { KeyboardShortcutsDialogProps } from "@/features/app-shell";

function getPrimaryModifierLabel() {
  if (typeof navigator === "undefined") {
    return "Ctrl";
  }

  const platformDescriptor = `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|iPhone|iPad|iPod/i.test(platformDescriptor) ? "Cmd" : "Ctrl";
}

function getShortcutGroups(primaryModifierLabel: string) {
  return [
    {
      category: "General",
      items: [
        { keys: `${primaryModifierLabel}+S`, description: "Save project" },
        { keys: `${primaryModifierLabel}+Z`, description: "Undo" },
        {
          keys: `${primaryModifierLabel}+Shift+Z`,
          description: "Redo",
        },
        { keys: `${primaryModifierLabel}+Y`, description: "Redo (alt)" },
        { keys: "Delete / Backspace", description: "Delete selection" },
      ],
    },
    {
      category: "Export",
      items: [
        { keys: `${primaryModifierLabel}+Shift+E`, description: "Export map" },
        {
          keys: `${primaryModifierLabel}+Shift+B`,
          description: "Export tileset",
        },
      ],
    },
    {
      category: "Tools",
      items: [
        { keys: "S", description: "Select tool" },
        { keys: "B", description: "Paint tool" },
        { keys: "A", description: "Autotile tool" },
        { keys: "E", description: "Erase tool" },
        { keys: "G", description: "Fill tool" },
      ],
    },
    {
      category: "Map Editing",
      items: [
        { keys: "H", description: "Flip hovered tile horizontally" },
        { keys: "V", description: "Flip hovered tile vertically" },
      ],
    },
    {
      category: "Brush Size",
      items: [
        { keys: "1", description: "1×1 brush" },
        { keys: "2", description: "2×2 brush" },
        { keys: "3", description: "3×3 brush" },
        { keys: "4", description: "4×4 brush" },
        { keys: "5", description: "5×5 brush" },
      ],
    },
    {
      category: "Viewport",
      items: [
        { keys: "+ / =", description: "Zoom in (map)" },
        { keys: "-", description: "Zoom out (map)" },
      ],
    },
  ];
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  const shortcuts = getShortcutGroups(getPrimaryModifierLabel());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-100">
        <DialogHeader>
          <DialogTitle className="text-primary">Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            List of available keyboard shortcuts
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between text-sm py-0.5"
                  >
                    <span className="text-foreground">{item.description}</span>
                    <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
