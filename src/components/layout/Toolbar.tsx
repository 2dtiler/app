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
import { useEditorStore } from "@/hooks/use-editor-store";

interface ToolbarProps {
  onNewProject: () => void;
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
}

export function Toolbar({
  onNewProject,
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
}: ToolbarProps) {
  const { controls } = useEditorStore();

  return (
    <header className="flex h-8 shrink-0 items-center border-b border-border bg-card px-1">
      <Menubar className="h-7 border-none bg-transparent shadow-none rounded-none p-0">
        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            File
          </MenubarTrigger>
          <MenubarContent className="min-w-[180px]">
            <MenubarItem onClick={onNewProject}>
              New Project
              <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Import</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={onImportProject}>
                  Project (.2dp)
                </MenubarItem>
                <MenubarItem onClick={onImportMap}>Map</MenubarItem>
                <MenubarItem onClick={onImportTileset}>Tileset</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Export</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={onExportProject}>
                  Project (.2dp)
                </MenubarItem>
                <MenubarItem onClick={onExportMap}>Map</MenubarItem>
                <MenubarItem onClick={onExportTileset}>Tileset</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={onOpenSettings}>
              Settings
              <MenubarShortcut>⌘,</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            Edit
          </MenubarTrigger>
          <MenubarContent className="min-w-[180px]">
            <MenubarItem
              onClick={() => controls.back()}
              disabled={!controls.canBack()}
            >
              Undo
              <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={() => controls.forward()}
              disabled={!controls.canForward()}
            >
              Redo
              <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-6 px-2 text-xs font-medium data-[state=open]:bg-accent">
            Help
          </MenubarTrigger>
          <MenubarContent className="min-w-[180px]">
            <MenubarItem onClick={onAbout}>About</MenubarItem>
            <MenubarItem onClick={onKeyboardShortcuts}>
              Keyboard Shortcuts
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onSubmitBug}>Submit Bug</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex-1" />
      <span className="text-[10px] font-medium text-primary/60 tracking-widest uppercase mr-1">
        2D TILER
      </span>
    </header>
  );
}
