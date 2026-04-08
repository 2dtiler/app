import type { ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type EditorWorkspaceTab = "layers" | "objects";

interface CompactEditorShellProps {
  tilesetPanel: ReactNode;
  mapPanel: ReactNode;
  workspaceSummary: string;
  workspaceButtonLabel: string;
  workspaceOpen: boolean;
  onOpenWorkspace: () => void;
}

export function CompactEditorShell({
  tilesetPanel,
  mapPanel,
  workspaceSummary,
  workspaceButtonLabel,
  workspaceOpen,
  onOpenWorkspace,
}: CompactEditorShellProps) {
  return (
    <Group orientation="vertical" id="compact-layout">
      <Panel defaultSize="42%" minSize="25%" maxSize="60%">
        <section
          role="region"
          aria-label="Tileset panel"
          className="h-full min-h-0"
        >
          {tilesetPanel}
        </section>
      </Panel>

      <Separator
        aria-label="Resize tileset and map panels"
        className="h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize"
      />

      <Panel defaultSize="58%" minSize="35%">
        <section
          role="region"
          aria-label="Map workspace"
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2 shrink-0">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
                Workspace
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {workspaceSummary}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-label="Open layers and objects workspace"
              aria-haspopup="dialog"
              aria-expanded={workspaceOpen}
              aria-controls="mobile-editor-workspace"
              onClick={onOpenWorkspace}
            >
              {workspaceButtonLabel}
            </Button>
          </div>

          <div className="flex-1 min-h-0">{mapPanel}</div>
        </section>
      </Panel>
    </Group>
  );
}

interface DesktopEditorLayoutProps {
  tilesetPanel: ReactNode;
  mapPanel: ReactNode;
  layersPanel: ReactNode;
  objectsPanel: ReactNode;
  isObjectLayerActive: boolean;
}

export function DesktopEditorLayout({
  tilesetPanel,
  mapPanel,
  layersPanel,
  objectsPanel,
  isObjectLayerActive,
}: DesktopEditorLayoutProps) {
  return (
    <Group orientation="horizontal" id="main-layout">
      <Panel defaultSize="50%" minSize="15%" maxSize="60%">
        <section
          role="region"
          aria-label="Tileset panel"
          className="h-full min-h-0"
        >
          {tilesetPanel}
        </section>
      </Panel>

      <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

      <Panel defaultSize="50%" minSize="25%">
        <Group orientation="horizontal" id="right-layout">
          <Panel defaultSize="75%" minSize="30%">
            <section
              role="region"
              aria-label="Map panel"
              className="h-full min-h-0"
            >
              {mapPanel}
            </section>
          </Panel>

          <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

          <Panel defaultSize="25%" minSize="10%" maxSize="50%">
            <section
              role="region"
              aria-label="Layer workspace"
              className="h-full min-h-0"
            >
              {isObjectLayerActive ? (
                <Group orientation="vertical" id="layers-objects-layout">
                  <Panel defaultSize="50%" minSize="20%">
                    {layersPanel}
                  </Panel>
                  <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize" />
                  <Panel defaultSize="50%" minSize="20%">
                    {objectsPanel}
                  </Panel>
                </Group>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="flex-1 min-h-0 overflow-auto">
                    {layersPanel}
                  </div>
                </div>
              )}
            </section>
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}

interface EditorWorkspaceDrawerProps {
  open: boolean;
  activeTab: EditorWorkspaceTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: EditorWorkspaceTab) => void;
  layersPanel: ReactNode;
  objectsPanel: ReactNode;
}

export function EditorWorkspaceDrawer({
  open,
  activeTab,
  onOpenChange,
  onTabChange,
  layersPanel,
  objectsPanel,
}: EditorWorkspaceDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        id="mobile-editor-workspace"
        className="w-[min(26rem,85vw)] max-w-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <DrawerTitle className="font-mono text-sm uppercase tracking-[0.14em]">
              Workspace
            </DrawerTitle>
            <DrawerDescription>
              Manage layers and objects without replacing the map.
            </DrawerDescription>
          </div>

          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="xs">
              Close
            </Button>
          </DrawerClose>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as EditorWorkspaceTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-3">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="layers">Layers</TabsTrigger>
              <TabsTrigger value="objects">Objects</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="layers" className="min-h-0 flex-1">
            <div className="h-full min-h-0">{layersPanel}</div>
          </TabsContent>

          <TabsContent value="objects" className="min-h-0 flex-1">
            <div className="h-full min-h-0">{objectsPanel}</div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
