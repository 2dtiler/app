import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  {
    category: "General",
    items: [
      { keys: "Ctrl+S", description: "Save project" },
      { keys: "Ctrl+Z", description: "Undo" },
      { keys: "Ctrl+Shift+Z", description: "Redo" },
      { keys: "Ctrl+Y", description: "Redo (alt)" },
    ],
  },
  {
    category: "Tools",
    items: [
      { keys: "B", description: "Paint tool" },
      { keys: "E", description: "Erase tool" },
      { keys: "G", description: "Fill tool" },
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

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
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
