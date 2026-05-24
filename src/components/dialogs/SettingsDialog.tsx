import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, ExternalLink, Check, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { getSettings, saveSettings } from "@/services/db";
import {
  API_KEY_PROVIDERS,
  hasApiKey,
  saveApiKey,
  deleteApiKey,
} from "@/config/api-keys";
import type {
  SettingsDialogProps,
  SettingsKeyRowProps as KeyRowProps,
  SettingsSection,
  SettingsSectionId,
} from "@/features/app-shell";
import type { AppSettings } from "@/types";

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    label: "General",
    description: "Project behavior and application defaults.",
  },
  {
    id: "api-keys",
    label: "API Keys",
    description: "Provider credentials used for AI image generation.",
  },
];

function ApiKeyRow({ id, label, url, placeholder }: KeyRowProps) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = `api-key-${id}`;

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
        <Label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </Label>
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
            id={inputId}
            name={inputId}
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
            aria-label={
              visible ? `Hide ${label} API key` : `Show ${label} API key`
            }
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
            aria-label={`Remove ${label} API key`}
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
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");

  const handleSectionChange = (value: string) => {
    setActiveSection(value as SettingsSectionId);
  };

  useEffect(() => {
    if (open) {
      setActiveSection("general");
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
      <DialogContent className="flex h-[min(85vh,720px)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-0">
          <div className="border-b border-border-visible px-6 pt-6 pb-5">
            <DialogTitle>Settings</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Application settings
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeSection}
          onValueChange={handleSectionChange}
          orientation="vertical"
          className="min-h-0 flex-1 flex-col items-stretch gap-0 overflow-hidden sm:flex-row"
        >
          <aside className="border-b border-border-visible px-4 py-4 sm:flex sm:h-full sm:w-56 sm:flex-col sm:self-stretch sm:border-r sm:border-b-0 sm:px-3 sm:py-5">
            <div className="space-y-2 sm:hidden">
              <Label htmlFor="settings-section-select" className="text-xs font-medium">
                Section
              </Label>
              <Select
                name="settings-section"
                value={activeSection}
                onValueChange={handleSectionChange}
              >
                <SelectTrigger
                  id="settings-section-select"
                  aria-label="Settings section"
                  className="h-11 w-full rounded-xl px-3 text-left"
                >
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {SETTINGS_SECTIONS.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TabsList
              aria-label="Settings sections"
              className="hidden w-full items-stretch justify-start self-start gap-1 bg-transparent p-0 sm:flex sm:h-full"
              variant="line"
            >
              {SETTINGS_SECTIONS.map((section) => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="min-h-11 rounded-xl px-3 py-2 text-left whitespace-normal after:hidden"
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span>{section.label}</span>
                    <span className="text-[10px] leading-relaxed text-muted-foreground whitespace-normal wrap-break-word">
                      {section.description}
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
            <TabsContent
              value="general"
              className="mt-0 h-full overflow-y-auto"
            >
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    General
                  </h2>
                  <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                    Control how the app handles project saving.
                  </p>
                </div>
                <section
                  aria-labelledby="settings-general-autosave-label"
                  className="rounded-xl border border-border-visible p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label
                        id="settings-general-autosave-label"
                        htmlFor="autosave"
                        className="text-sm"
                      >
                        Save project every minute
                      </Label>
                      <p
                        id="settings-general-autosave-description"
                        className="text-xs leading-relaxed text-muted-foreground"
                      >
                        Automatically persists your current project in the
                        background.
                      </p>
                    </div>
                    <Switch
                      id="autosave"
                      name="autosave"
                      checked={settings.autoSaveEnabled}
                      onCheckedChange={handleToggleAutoSave}
                      aria-describedby="settings-general-autosave-description"
                    />
                  </div>
                </section>
              </div>
            </TabsContent>

            <TabsContent
              value="api-keys"
              className="mt-0 h-full overflow-y-auto"
            >
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    API Keys
                  </h2>
                  <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                    Keys are obfuscated locally in your browser. They are never
                    sent to any server other than the provider&apos;s own API,
                    but any script running on this origin can still access them.
                  </p>
                </div>
                <div className="space-y-3">
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
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
