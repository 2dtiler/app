import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({
    autoSaveEnabled: true,
  });

  useEffect(() => {
    if (open) {
      getSettings().then(setSettings);
    }
  }, [open]);

  const handleToggleAutoSave = async (checked: boolean) => {
    const next = { ...settings, autoSaveEnabled: checked };
    setSettings(next);
    await saveSettings(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between py-3">
          <Label htmlFor="autosave" className="text-sm">
            Save every minute
          </Label>
          <Switch
            id="autosave"
            checked={settings.autoSaveEnabled}
            onCheckedChange={handleToggleAutoSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
