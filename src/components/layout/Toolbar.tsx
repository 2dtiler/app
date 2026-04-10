import { memo, useEffect, useMemo, useRef } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
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
} from "@/components/ui/Menubar";
import { cn } from "@/lib/utils";
// rerender-defer-reads: use store directly for controls to avoid
// subscribing to full state which would re-render on every change
import { getEditorStore } from "@/lib/store";
import type { ToolbarProps } from "@/types";

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
  const { resolvedTheme, setTheme } = useTheme();
  // Track whether a tool item was selected so we can suppress focus-return to the
  // menubar trigger (which would land inside vaul's aria-hidden root)
  const toolOpeningRef = useRef(false);
  const activeTheme = resolvedTheme === "light" ? "light" : "dark";
  const nextTheme = activeTheme === "light" ? "dark" : "light";
  const ThemeIcon = activeTheme === "light" ? SunMedium : MoonStar;

  useEffect(() => {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (!themeColor) return;
    themeColor.setAttribute(
      "content",
      activeTheme === "light" ? "#f5f5f5" : "#000000",
    );
  }, [activeTheme]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-background px-3">
      <div className="flex">
        <span className="font-mono uppercase truncate text-sm -mt-0.5 ">
          2D Tiler
        </span>
      </div>

      <Menubar className="h-8 border-none bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem onMouseDown={onNewProject} className="cursor-pointer">
              Manage Projects
              <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onMouseDown={onSaveProject} className="cursor-pointer">
              Save Project
              <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger className="cursor-pointer">
                Import
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  onMouseDown={onImportProject}
                  className="cursor-pointer"
                >
                  2d Tiler Project (.2dp)
                </MenubarItem>
                <MenubarItem
                  onMouseDown={onImportMap}
                  className="cursor-pointer"
                >
                  Map
                </MenubarItem>
                <MenubarItem
                  onMouseDown={onImportTileset}
                  className="cursor-pointer"
                >
                  Tileset
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger className="cursor-pointer">
                Export
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  onMouseDown={onExportProject}
                  className="cursor-pointer"
                >
                  2d Tiler Project (.2dp)
                </MenubarItem>
                <MenubarItem
                  onMouseDown={onExportMap}
                  className="cursor-pointer"
                >
                  Map
                </MenubarItem>
                <MenubarItem
                  onMouseDown={onExportTileset}
                  className="cursor-pointer"
                >
                  Tileset
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem
              onMouseDown={onOpenSettings}
              className="cursor-pointer"
            >
              Settings
              <MenubarShortcut>⌘,</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
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
            <MenubarItem onMouseDown={onFindReplace} className="cursor-pointer">
              Find and Replace
              <MenubarShortcut>⌘H</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Tools</MenubarTrigger>
          <MenubarContent
            className="min-w-45"
            onCloseAutoFocus={(e) => {
              if (toolOpeningRef.current) {
                toolOpeningRef.current = false;
                e.preventDefault();
              }
            }}
          >
            <MenubarItem
              onMouseDown={() => {
                toolOpeningRef.current = true;
                onOpenTool("image-editor");
              }}
              className="cursor-pointer"
            >
              Image/Sprite Editor
            </MenubarItem>
            <MenubarItem
              onMouseDown={() => {
                toolOpeningRef.current = true;
                onOpenTool("ai-assets");
              }}
              className="cursor-pointer"
            >
              AI Assets Generator
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent className="min-w-45">
            <MenubarItem onMouseDown={onAbout} className="cursor-pointer">
              About
            </MenubarItem>
            <MenubarItem
              onMouseDown={onKeyboardShortcuts}
              className="cursor-pointer"
            >
              Keyboard Shortcuts
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onMouseDown={onSubmitBug} className="cursor-pointer">
              Submit Bug
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-visible bg-background text-text-secondary transition-colors hover:text-foreground",
          )}
          onClick={() => setTheme(nextTheme)}
          aria-pressed={activeTheme === "dark"}
          aria-label={`Use ${nextTheme} mode`}
          title={`Use ${nextTheme} mode`}
        >
          <ThemeIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
});
