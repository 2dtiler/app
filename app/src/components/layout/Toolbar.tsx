import { memo, useMemo } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
// rerender-defer-reads: use store directly for controls to avoid
// subscribing to full state which would re-render on every change
import { getEditorStore } from "@/lib/store";

export type ToolName = "image-editor" | "ai-assets";

interface ToolbarProps {
  onNewProject: () => void;
  onSaveProject: () => void;
  onImportProject: () => void;
  onImportMap: () => void;
  onImportTileset: () => void;
  onExportProject: () => void;
  onExportMap: () => void;
  onExportTileset: () => void;
  onOpenSettings: () => void;
  onAbout: () => void;
  onKeyboardShortcuts: () => void;
  onSubmitBug: () => void;
  onFindReplace: () => void;
  onOpenTool: (tool: ToolName) => void;
}

export const Toolbar = memo(function Toolbar({
  onNewProject,
  onSaveProject,
  onImportProject,
  onImportMap,
  onImportTileset,
  onExportProject,
  onExportMap,
  onExportTileset,
  onOpenSettings,
  onAbout,
  onKeyboardShortcuts,
  onSubmitBug,
  onFindReplace,
  onOpenTool,
}: ToolbarProps) {
  // Get controls without subscribing to state — avoids re-renders on every state change
  const controls = useMemo(() => getEditorStore().getControls(), []);

  return (
    <header className="flex h-8 shrink-0 items-center border-b border-border bg-card px-1">
      <Menubar className="h-7 border-none bg-transparent shadow-none rounded-none p-0">
        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            File
          </MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem onMouseDown={onNewProject}>
              New Project
              <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onMouseDown={onSaveProject}>
              Save Project
              <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Import</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onMouseDown={onImportProject}>
                  Project (.2dp)
                </MenubarItem>
                <MenubarItem onMouseDown={onImportMap}>Map</MenubarItem>
                <MenubarItem onMouseDown={onImportTileset}>Tileset</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Export</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onMouseDown={onExportProject}>
                  Project (.2dp)
                </MenubarItem>
                <MenubarItem onMouseDown={onExportMap}>Map</MenubarItem>
                <MenubarItem onMouseDown={onExportTileset}>Tileset</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onMouseDown={onOpenSettings}>
              Settings
              <MenubarShortcut>⌘,</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            Edit
          </MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem
              onMouseDown={() => controls.back()}
              disabled={!controls.canBack()}
            >
              Undo
              <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onMouseDown={() => controls.forward()}
              disabled={!controls.canForward()}
            >
              Redo
              <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onMouseDown={onFindReplace}>
              Find and Replace
              <MenubarShortcut>⌘H</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            Tools
          </MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem onMouseDown={() => onOpenTool("image-editor")}>
              Image/Sprite Editor
            </MenubarItem>
            <MenubarItem onMouseDown={() => onOpenTool("ai-assets")}>
              AI Assets Generator
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            Help
          </MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem onMouseDown={onAbout}>About</MenubarItem>
            <MenubarItem onMouseDown={onKeyboardShortcuts}>
              Keyboard Shortcuts
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onMouseDown={onSubmitBug}>Submit Bug</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex-1" />
      <span className="text-[10px] font-medium text-primary/60 tracking-widest uppercase mr-1">
        2D TILER
      </span>
    </header>
  );
});
