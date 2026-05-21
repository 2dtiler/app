import type { ImportExportDialogMode } from "@/features/import-export/types";

export type ToolName = "image-editor" | "ai-assets";

export interface ToolbarProps {
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenImportDialog: () => void;
  onOpenExportDialog: () => void;
  onOpenSettings: () => void;
  onAbout: () => void;
  onKeyboardShortcuts: () => void;
  onSubmitBug: () => void;
  onFindReplace: () => void;
  onOpenTool: (tool: ToolName) => void;
}

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

export interface AppShellEditorRuntimeProps {
  importExportDialogOpen: boolean;
  setImportExportDialogOpen: (open: boolean) => void;
  importExportDialogMode: ImportExportDialogMode;
  setImportExportDialogMode: (mode: ImportExportDialogMode) => void;
}

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface SettingsKeyRowProps {
  id: string;
  label: string;
  url: string;
  placeholder: string;
}

export interface ToolDrawerProps {
  activeTool: ToolName | null;
  onClose: () => void;
}
