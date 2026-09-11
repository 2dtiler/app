import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { applyBlobsmith8x6Layout } from "@/features/map-editor/lib/autotile-dialog";
import type { AutotileBlobsmithImportButtonProps } from "@/features/map-editor/types/autotile-dialog";

const CONFIRM_MESSAGE =
  "该功能仅适用于 Blobsmith 标准8列×6行47‑blob图集。\n将按照图集格子索引顺序0‑46，依次绑定到47个Blob pattern。\n非标准图集会导致瓦片映射错乱，确定继续吗？";

const LENGTH_ERROR_MESSAGE =
  "Blobsmith 导入失败：当前 Autotile pattern 数量必须为 47。";

const SUCCESS_MESSAGE =
  "已完成47个pattern自动绑定，请点击 SAVE AUTOTILE SETUP 保存Autotile配置，否则修改不会生效";

export function AutotileBlobsmithImportButton({
  enabled,
  slotIds,
  tileSize,
  terrain,
  onApply,
}: AutotileBlobsmithImportButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disabled = !enabled || terrain === null;

  const handleConfirm = useCallback(() => {
    if (!terrain) {
      return;
    }

    const applied = applyBlobsmith8x6Layout(terrain, slotIds, tileSize);
    setConfirmOpen(false);

    if (!applied) {
      window.setTimeout(() => {
        window.alert(LENGTH_ERROR_MESSAGE);
      }, 0);
      return;
    }

    onApply(applied);
    toast.success(SUCCESS_MESSAGE);
  }, [onApply, slotIds, terrain, tileSize]);

  return (
    <>
      <Button
        type="button"
        id="autotile-import-blobsmith-8x6"
        name="autotile-import-blobsmith-8x6"
        variant="secondary"
        size="sm"
        disabled={disabled}
        aria-disabled={disabled}
        onMouseDown={() => {
          if (disabled) {
            return;
          }
          setConfirmOpen(true);
        }}
      >
        Import Blobsmith 8×6 layout
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Blobsmith 8×6 layout?</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {CONFIRM_MESSAGE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={handleConfirm}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
