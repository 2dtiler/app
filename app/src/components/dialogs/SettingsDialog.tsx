import { useState, useEffect } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { getSettings, saveSettings } from "@/lib/db";
import { getProviders, saveProvider } from "@/lib/ai-providers";
import type { AppSettings, AIProviderConfig } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({
    autoSaveEnabled: true,
  });
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      Promise.all([getSettings(), getProviders()]).then(
        ([newSettings, newProviders]) => {
          setSettings(newSettings);
          setProviders(newProviders);
          setVisibleKeys({});
        },
      );
    }
  }, [open]);

  const handleToggleAutoSave = async (checked: boolean) => {
    const next = { ...settings, autoSaveEnabled: checked };
    setSettings(next);
    await saveSettings(next);
  };

  const handleProviderChange = async (
    id: string,
    field: keyof AIProviderConfig,
    value: string | boolean,
  ) => {
    const updated = providers.map((p) =>
      p.id === id ? { ...p, [field]: value } : p,
    );
    setProviders(updated);
    const provider = updated.find((p) => p.id === id);
    if (provider) {
      await saveProvider(provider);
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const showBaseUrl = (id: string) => id === "ollama" || id === "openai";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Application settings
          </DialogDescription>
        </DialogHeader>
        <Accordion type="multiple" defaultValue={["general", "ai-providers"]}>
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

          <AccordionItem value="ai-providers">
            <AccordionTrigger>AI Providers</AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple">
                {providers.map((provider) => (
                  <AccordionItem key={provider.id} value={provider.id}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${
                            provider.enabled
                              ? "bg-green-500"
                              : "bg-muted-foreground/30"
                          }`}
                        />
                        {provider.name}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`${provider.id}-enabled`}
                          className="text-sm"
                        >
                          Enabled
                        </Label>
                        <Switch
                          id={`${provider.id}-enabled`}
                          checked={provider.enabled}
                          onCheckedChange={(checked) =>
                            handleProviderChange(
                              provider.id,
                              "enabled",
                              checked,
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`${provider.id}-key`}
                          className="text-sm"
                        >
                          API Key
                        </Label>
                        <div className="relative">
                          <Input
                            id={`${provider.id}-key`}
                            type={
                              visibleKeys[provider.id] ? "text" : "password"
                            }
                            value={provider.apiKey}
                            onChange={(e) =>
                              handleProviderChange(
                                provider.id,
                                "apiKey",
                                e.target.value,
                              )
                            }
                            placeholder={
                              provider.id === "ollama"
                                ? "Optional for local Ollama"
                                : "Enter API key"
                            }
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(provider.id)}
                            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                          >
                            {visibleKeys[provider.id] ? (
                              <EyeOffIcon className="size-4" />
                            ) : (
                              <EyeIcon className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {showBaseUrl(provider.id) && (
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`${provider.id}-url`}
                            className="text-sm"
                          >
                            Base URL
                          </Label>
                          <Input
                            id={`${provider.id}-url`}
                            type="url"
                            value={provider.baseUrl ?? ""}
                            onChange={(e) =>
                              handleProviderChange(
                                provider.id,
                                "baseUrl",
                                e.target.value,
                              )
                            }
                            placeholder="https://..."
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
