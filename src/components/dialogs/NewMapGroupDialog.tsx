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
import type { NewMapGroupDialogProps } from "@/types/app/dialogs";

export function NewMapGroupDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onCreate,
}: NewMapGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>New Map Group</DialogTitle>
          <DialogDescription className="sr-only">
            Enter a name for the new map group
          </DialogDescription>
        </DialogHeader>
        <Input
          id="new-map-group-name"
          name="new-map-group-name"
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
