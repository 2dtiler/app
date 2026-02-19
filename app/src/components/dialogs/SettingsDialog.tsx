import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
      getSettings().then((newSettings) => {
        setSettings(newSettings);
      });
    }
  }, [open]);

  const handleToggleAutoSave = async (checked: boolean) => {
    const next = { ...settings, autoSaveEnabled: checked };
    setSettings(next);
    await saveSettings(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Application settings
          </DialogDescription>
        </DialogHeader>
        <Accordion type="multiple" defaultValue={["general"]}>
          <AccordionItem value="general">
            <AccordionTrigger>General</AccordionTrigger>
            <AccordionContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="autosave" className="text-sm">
                  Save project every minute
                </Label>
                <Switch
                  id="autosave"
                  checked={settings.autoSaveEnabled}
                  onCheckedChange={handleToggleAutoSave}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
