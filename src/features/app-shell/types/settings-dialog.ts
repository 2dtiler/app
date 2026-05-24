export type SettingsSectionId = "general" | "api-keys";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
}
