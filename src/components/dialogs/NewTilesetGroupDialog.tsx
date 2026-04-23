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
import type { NewTilesetGroupDialogProps } from "@/features/map-editor/types/dialogs";

export function NewTilesetGroupDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onCreate,
}: NewTilesetGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>New Tileset Group</DialogTitle>
          <DialogDescription className="sr-only">
            Enter a name for the new tileset group
          </DialogDescription>
        </DialogHeader>
        <Input
          id="tileset-group-name"
          name="tileset-group-name"
          placeholder="Group name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          autoFocus
        />
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onMouseDown={onCreate} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
