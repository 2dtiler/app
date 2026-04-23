import type { ToolName } from "./components";

export interface AppShellProps {
  settingsOpen: boolean;
  setSettingsOpen: (value: boolean) => void;
  projectDialogOpen: boolean;
  setProjectDialogOpen: (value: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (value: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (value: boolean) => void;
  findReplaceOpen: boolean;
  setFindReplaceOpen: (value: boolean) => void;
  bugReportOpen: boolean;
  setBugReportOpen: (value: boolean) => void;
  activeTool: ToolName | null;
  setActiveTool: (value: ToolName | null) => void;
}