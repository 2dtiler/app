import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ExternalLink, Check, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings } from "@/lib/db";
import {
  API_KEY_PROVIDERS,
  hasApiKey,
  saveApiKey,
  deleteApiKey,
} from "@/lib/api-keys";
import type { AppSettings } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Per-provider key row
// ---------------------------------------------------------------------------

interface KeyRowProps {
  id: string;
  label: string;
  url: string;
  placeholder: string;
}

function ApiKeyRow({ id, label, url, placeholder }: KeyRowProps) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasSaved(hasApiKey(id));
  }, [id]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await saveApiKey(id, trimmed);
    setHasSaved(true);
    setValue("");
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = () => {
    deleteApiKey(id);
    setHasSaved(false);
    setValue("");
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Get key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {hasSaved && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          Key saved — replace below to update
        </p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            placeholder={hasSaved ? "Enter new key to replace" : placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 pr-8 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {visible ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 px-3 text-xs"
          onClick={() => void handleSave()}
          disabled={!value.trim()}
        >
          {saved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : "Save"}
        </Button>
        {hasSaved && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            title="Remove key"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

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

          <AccordionItem value="ai-keys">
            <AccordionTrigger>AI API Keys</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Keys are encrypted with AES-GCM and stored locally in your
                  browser — they are never sent to any server other than the
                  provider&apos;s own API.
                </p>
                {API_KEY_PROVIDERS.map((p) => (
                  <ApiKeyRow
                    key={p.id}
                    id={p.id}
                    label={p.label}
                    url={p.url}
                    placeholder={p.placeholder}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
