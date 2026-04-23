import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "@/components/ui/Button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/Drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type {
  CompactEditorShellProps,
  DesktopEditorLayoutProps,
  EditorWorkspaceDrawerProps,
  EditorWorkspaceTab,
} from "@/features/map-editor/types/editor-layout";

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
              aria-label="Open layer workspace"
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

export function DesktopEditorLayout({
  tilesetPanel,
  mapPanel,
  layersPanel,
  detailsPanel,
  showDetailsPanel,
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
              {showDetailsPanel ? (
                <Group orientation="vertical" id="layers-objects-layout">
                  <Panel defaultSize="50%" minSize="20%">
                    {layersPanel}
                  </Panel>
                  <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors cursor-row-resize" />
                  <Panel defaultSize="50%" minSize="20%">
                    {detailsPanel}
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

export function EditorWorkspaceDrawer({
  open,
  activeTab,
  onOpenChange,
  onTabChange,
  layersPanel,
  detailsPanel,
  detailsTabLabel,
  showDetailsPanel,
}: EditorWorkspaceDrawerProps) {
  const resolvedActiveTab = showDetailsPanel ? activeTab : "layers";

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
              Manage layers and layer details without replacing the map.
            </DrawerDescription>
          </div>

          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="xs">
              Close
            </Button>
          </DrawerClose>
        </div>

        <Tabs
          value={resolvedActiveTab}
          onValueChange={(value) => onTabChange(value as EditorWorkspaceTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-3">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="layers">Layers</TabsTrigger>
              {showDetailsPanel ? (
                <TabsTrigger value="details">
                  {detailsTabLabel ?? "Details"}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>

          <TabsContent value="layers" className="min-h-0 flex-1">
            <div className="h-full min-h-0">{layersPanel}</div>
          </TabsContent>

          {showDetailsPanel ? (
            <TabsContent value="details" className="min-h-0 flex-1">
              <div className="h-full min-h-0">{detailsPanel}</div>
            </TabsContent>
          ) : null}
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
