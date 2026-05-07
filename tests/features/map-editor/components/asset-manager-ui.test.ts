import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { AssetManagerDialog } from "@/features/map-editor/components/AssetManagerDialog";
import { MapPanelTabs } from "@/features/map-editor/components/MapPanel/MapPanelTabs";
import { TilesetPanelTabs } from "@/features/map-editor/components/TilesetPanel/TilesetPanelTabs";
import { DEFAULT_EDITOR_STATE, type Project } from "@/types";

vi.mock("@/components/ui/Dialog", async () => {
  const React = await import("react");

  return {
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children: React.ReactNode;
    }) =>
      open
        ? React.createElement("div", { "data-slot": "dialog" }, children)
        : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "dialog-content" }, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dialog-description" },
        children,
      ),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "dialog-footer" }, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "dialog-header" }, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "dialog-title" }, children),
  };
});

vi.mock("@/components/ui/Select", async () => {
  const React = await import("react");

  return {
    Select: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "select" }, children),
    SelectTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("span", null, placeholder),
    SelectContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "select-content" }, children),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) =>
      React.createElement(
        "div",
        { "data-slot": "select-item", "data-value": value },
        children,
      ),
  };
});

vi.mock("@/components/ui/Tabs", async () => {
  const React = await import("react");

  return {
    Tabs: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tabs" }, children),
    TabsList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tabs-list" }, children),
    TabsTrigger: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) =>
      React.createElement(
        "button",
        { "data-value": value, type: "button" },
        children,
      ),
  };
});

vi.mock("@/components/ui/Tooltip", async () => {
  const React = await import("react");

  return {
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tooltip" }, children),
    TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tooltip-trigger" }, children),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tooltip-content" }, children),
  };
});

vi.mock("@/components/ui/ContextMenu", async () => {
  const React = await import("react");

  return {
    ContextMenu: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "context-menu" }, children),
    ContextMenuTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "context-menu-trigger" },
        children,
      ),
    ContextMenuContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "context-menu-content" },
        children,
      ),
    ContextMenuItem: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
  };
});

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalActEnvironment = (
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;
const { window } = parseHTML("<html><body></body></html>");

function installReactDomEnvironment() {
  Object.assign(globalThis, {
    document: window.document,
    window,
    Element: window.Element,
    Event: window.Event,
    HTMLElement: window.HTMLElement,
    MouseEvent: window.MouseEvent,
    Node: window.Node,
    SVGElement: window.SVGElement,
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

function restoreReactDomEnvironment() {
  Object.assign(globalThis, {
    document: originalDocument,
    window: originalWindow,
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
}

function createProject(): Project {
  return {
    id: "project-1" as Project["id"],
    name: "Project",
    createdAt: 0,
    updatedAt: 0,
    tileSize: 16,
    tilesetGroups: [
      {
        id: "tileset-group-1" as Project["tilesetGroups"][number]["id"],
        name: "Tilesets",
        order: 0,
      },
    ],
    tilesets: [
      {
        id: "tileset-1" as Project["tilesets"][number]["id"],
        name: "Terrain",
        groupId: "tileset-group-1" as Project["tilesets"][number]["groupId"],
        tileSize: 16,
        assetId: "asset-1" as Project["tilesets"][number]["assetId"],
        imageWidth: 32,
        imageHeight: 32,
        createdAt: 0,
      },
    ],
    mapGroups: [
      {
        id: "map-group-1" as Project["mapGroups"][number]["id"],
        name: "Maps",
        order: 0,
      },
    ],
    maps: [
      {
        id: "map-1" as Project["maps"][number]["id"],
        name: "Map One",
        groupId: "map-group-1" as Project["maps"][number]["groupId"],
        orientation: "orthogonal",
        widthInTiles: 20,
        heightInTiles: 15,
        tileSize: 16,
        layerOrder: [],
        createdAt: 0,
      },
    ],
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
}

function render(element: ReturnType<typeof createElement>) {
  installReactDomEnvironment();
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    root,
  };
}

function unmountRendered(rendered: { container: HTMLElement; root: Root }) {
  act(() => {
    rendered.root.unmount();
  });
  rendered.container.remove();
  restoreReactDomEnvironment();
}

afterEach(() => {
  restoreReactDomEnvironment();
});

test("MapPanelTabs exposes the Manage Maps selector entry", () => {
  const project = createProject();
  const rendered = render(
    createElement(MapPanelTabs, {
      activeGroup: project.mapGroups[0],
      groupMaps: project.maps,
      onAddMap: vi.fn(),
      onCancelRename: vi.fn(),
      onCommitRename: vi.fn(),
      onDuplicateMap: vi.fn(),
      onGroupChange: vi.fn(),
      onRequestDeleteTarget: vi.fn(),
      onSelectMap: vi.fn(),
      onStartRenamingTab: vi.fn(),
      project,
      renameInputRef: { current: null },
      renameValue: "",
      renamingTabId: null,
      setRenameValue: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
        activeMapGroupId: project.mapGroups[0]?.id ?? null,
        activeMapId: project.maps[0]?.id ?? null,
      },
    }),
  );

  expect(rendered.container.textContent).toContain("Manage Maps");

  unmountRendered(rendered);
});

test("TilesetPanelTabs exposes the Manage Tilesets selector entry", () => {
  const project = createProject();
  const rendered = render(
    createElement(TilesetPanelTabs, {
      activeGroup: project.tilesetGroups[0],
      groupTilesets: project.tilesets,
      onAddTileset: vi.fn(),
      onCancelRename: vi.fn(),
      onCommitRename: vi.fn(),
      onDuplicateTileset: vi.fn(),
      onGroupChange: vi.fn(),
      onRequestDeleteTarget: vi.fn(),
      onSelectTileset: vi.fn(),
      onStartRenamingTab: vi.fn(),
      project,
      renameInputRef: { current: null },
      renameValue: "",
      renamingTabId: null,
      setRenameValue: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
        activeTilesetGroupId: project.tilesetGroups[0]?.id ?? null,
        activeTilesetId: project.tilesets[0]?.id ?? null,
      },
    }),
  );

  expect(rendered.container.textContent).toContain("Manage Tilesets");

  unmountRendered(rendered);
});

test("AssetManagerDialog disables non-empty group deletion and shows the reason", () => {
  const rendered = render(
    createElement(AssetManagerDialog, {
      open: true,
      onOpenChange: vi.fn(),
      title: "Manage Assets",
      description: "Dialog description",
      groupSectionTitle: "Groups",
      itemSectionTitle: "Items",
      createGroupLabel: "New Group",
      createItemLabel: "New Item",
      emptyItemsMessage: "No items",
      groups: [
        {
          id: "group-1",
          name: "Locked",
          itemCount: 2,
          canDelete: false,
          deleteDisabledReason: "Move items first.",
        },
      ],
      items: [
        {
          id: "item-1",
          name: "First",
        },
      ],
      selectedGroupId: "group-1",
      onSelectGroup: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateItem: vi.fn(),
      onRenameGroup: vi.fn(),
      onDeleteGroup: vi.fn(),
      onRenameItem: vi.fn(),
      onDeleteItem: vi.fn(),
      onReorderGroups: vi.fn(),
      onMoveItemToGroup: vi.fn(),
      onReorderItems: vi.fn(),
    }),
  );

  const deleteButton = rendered.container.querySelector(
    'button[aria-label="Delete group Locked"]',
  ) as HTMLButtonElement | null;

  expect(deleteButton?.disabled).toBe(true);
  expect(rendered.container.textContent).toContain("Move items first.");

  unmountRendered(rendered);
});
