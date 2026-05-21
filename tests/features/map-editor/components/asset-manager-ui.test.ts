import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { AssetManagerDialog } from "@/features/map-editor/components/AssetManagerDialog";
import { MapPanelDialogs } from "@/features/map-editor/components/MapPanel/MapPanelDialogs";
import { MapPanelTabs } from "@/features/map-editor/components/MapPanel/MapPanelTabs";
import { TilesetPanelDialogs } from "@/features/map-editor/components/TilesetPanel/TilesetPanelDialogs";
import { TilesetPanelTabs } from "@/features/map-editor/components/TilesetPanel/TilesetPanelTabs";
import { DEFAULT_EDITOR_STATE, type Project } from "@/types";

const { useAssetImageMock } = vi.hoisted(() => ({
  useAssetImageMock: vi.fn(
    (_assetId: string | null): HTMLImageElement | null => null,
  ),
}));

vi.mock("@/components/dialogs/NewMapGroupDialog", () => ({
  NewMapGroupDialog: () => null,
}));

vi.mock("@/components/dialogs/NewTilesetGroupDialog", () => ({
  NewTilesetGroupDialog: () => null,
}));

vi.mock("@/features/map-editor/hooks/use-asset-image", () => ({
  useAssetImage: (assetId: string | null) => useAssetImageMock(assetId),
}));

vi.mock("@/components/ui/AlertDialog", async () => {
  const React = await import("react");

  return {
    AlertDialog: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "alert-dialog" }, children),
    AlertDialogAction: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
    AlertDialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "alert-dialog-content" },
        children,
      ),
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "alert-dialog-description" },
        children,
      ),
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "alert-dialog-footer" },
        children,
      ),
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "alert-dialog-header" },
        children,
      ),
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "alert-dialog-title" },
        children,
      ),
  };
});

vi.mock(
  "@/features/map-editor/components/ObjectPropertiesDialogManager",
  () => ({
    ObjectPropertiesDialogManager: () => null,
  }),
);

vi.mock("@/features/map-editor/dialogs/AnimationDialog", () => ({
  AnimationDialog: () => null,
}));

vi.mock("@/features/map-editor/dialogs/AutotileDialog", () => ({
  AutotileDialog: () => null,
}));

vi.mock("@/features/map-editor/dialogs/FillTerrainDialog", () => ({
  FillTerrainDialog: () => null,
}));

vi.mock("@/features/map-editor/dialogs/MapOptionsDialog", () => ({
  MapOptionsDialog: () => null,
}));

vi.mock("@/features/map-editor/dialogs/NewMapDialog", () => ({
  NewMapDialog: () => null,
}));

vi.mock("@/features/map-editor/components/TilesetDeleteDialog", () => ({
  TilesetDeleteDialog: () => null,
}));

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
  useAssetImageMock.mockReset();
  useAssetImageMock.mockReturnValue(null);
  restoreReactDomEnvironment();
});

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function findButtonByText(root: ParentNode, label: string) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (element) => normalizeText(element.textContent) === label,
  );

  if (!(button instanceof window.HTMLElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function dispatchClick(element: HTMLElement) {
  element.dispatchEvent(new window.Event("click", { bubbles: true }));
}

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

test("AssetManagerDialog omits the legacy group and item eyebrow labels", () => {
  const rendered = render(
    createElement(AssetManagerDialog, {
      open: true,
      onOpenChange: vi.fn(),
      title: "Manage Assets",
      groupSectionTitle: "Collections",
      itemSectionTitle: "Entries",
      createGroupLabel: "Add Collection",
      createItemLabel: "Add Entry",
      emptyItemsMessage: "No entries",
      groups: [
        {
          id: "group-1",
          name: "Terrain Set",
          itemCount: 2,
          canDelete: true,
        },
      ],
      items: [
        {
          id: "item-1",
          name: "Forest",
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

  expect(rendered.container.textContent).not.toContain("Group");
  expect(rendered.container.textContent).not.toContain("Item");

  unmountRendered(rendered);
});

test("AssetManagerDialog renders image previews when an item exposes a preview asset", () => {
  useAssetImageMock.mockReturnValue({
    src: "/preview.png",
  } as HTMLImageElement);

  const rendered = render(
    createElement(AssetManagerDialog, {
      open: true,
      onOpenChange: vi.fn(),
      title: "Manage Assets",
      groupSectionTitle: "Collections",
      itemSectionTitle: "Entries",
      createGroupLabel: "Add Collection",
      createItemLabel: "Add Entry",
      emptyItemsMessage: "No entries",
      groups: [
        {
          id: "group-1",
          name: "Terrain Set",
          itemCount: 1,
          canDelete: true,
        },
      ],
      items: [
        {
          id: "item-1",
          name: "Forest",
          previewAssetId: "asset-1" as Project["tilesets"][number]["assetId"],
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

  const preview = rendered.container.querySelector(
    'img[alt="Forest preview"]',
  ) as HTMLImageElement | null;

  expect(preview?.getAttribute("src")).toBe("/preview.png");

  unmountRendered(rendered);
});

test("Manage Maps dialog New Group opens the map group dialog flow", () => {
  const project = createProject();
  const setAddGroupOpen = vi.fn();
  const setNewGroupName = vi.fn();
  const rendered = render(
    createElement(MapPanelDialogs, {
      addGroupOpen: false,
      addMapOpen: false,
      deleteTarget: null,
      manageMapsOpen: true,
      manageMapsGroups: [
        {
          id: "map-group-1",
          name: "Maps",
          itemCount: 1,
          canDelete: false,
        },
      ],
      manageMapsItems: [{ id: "map-1", name: "Map One" }],
      mapOptionsOpen: false,
      mapOptionsMap: undefined,
      manageMapsSelectedGroupId:
        project.mapGroups[0]?.id ??
        ("map-group-1" as Project["mapGroups"][number]["id"]),
      newGroupName: "Existing",
      newMapHeight: 15,
      newMapName: "Untitled Map",
      newMapType: "orthogonal",
      newMapWidth: 20,
      onApplyTerrainSelection: vi.fn(),
      onDeleteTerrain: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateMap: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onImportMapFromFile: vi.fn().mockResolvedValue(false),
      onMapOptionsOpenChange: vi.fn(),
      onManageMapsSelectedGroupChange: vi.fn(),
      onMoveMapToGroup: vi.fn(),
      onRequestCreateMap: vi.fn(),
      onRequestDeleteGroup: vi.fn(),
      onRequestEditMap: vi.fn(),
      onRenameGroup: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderMaps: vi.fn(),
      onUpdateMapOptions: vi.fn(),
      propsObjectId: null,
      setAddGroupOpen,
      setAddMapOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageMapsOpen: vi.fn(),
      setNewGroupName,
      setNewMapHeight: vi.fn(),
      setNewMapName: vi.fn(),
      setNewMapType: vi.fn(),
      setNewMapWidth: vi.fn(),
      setPropsObjectId: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
      },
      terrainDialogOpen: false,
      terrainDialogTarget: "paint",
      terrainDialogInitialTerrainId: null,
      terrainDialogInitialTiles: null,
      setTerrainDialogOpen: vi.fn(),
    }),
  );

  act(() => {
    dispatchClick(findButtonByText(rendered.container, "New Group"));
  });

  expect(setNewGroupName).toHaveBeenCalledWith("");
  expect(setAddGroupOpen).toHaveBeenCalledWith(true);

  unmountRendered(rendered);
});

test("Manage Maps dialog New Map opens the add map flow for the selected group", () => {
  const project = createProject();
  const onRequestCreateMap = vi.fn();
  const rendered = render(
    createElement(MapPanelDialogs, {
      addGroupOpen: false,
      addMapOpen: false,
      deleteTarget: null,
      manageMapsOpen: true,
      manageMapsGroups: [
        {
          id: "map-group-1",
          name: "Maps",
          itemCount: 1,
          canDelete: true,
        },
      ],
      manageMapsItems: [{ id: "map-1", name: "Map One" }],
      mapOptionsOpen: false,
      mapOptionsMap: undefined,
      manageMapsSelectedGroupId:
        project.mapGroups[0]?.id ??
        ("map-group-1" as Project["mapGroups"][number]["id"]),
      newGroupName: "",
      newMapHeight: 15,
      newMapName: "Untitled Map",
      newMapType: "orthogonal",
      newMapWidth: 20,
      onApplyTerrainSelection: vi.fn(),
      onDeleteTerrain: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateMap: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onImportMapFromFile: vi.fn().mockResolvedValue(false),
      onMapOptionsOpenChange: vi.fn(),
      onManageMapsSelectedGroupChange: vi.fn(),
      onMoveMapToGroup: vi.fn(),
      onRequestCreateMap,
      onRequestDeleteGroup: vi.fn(),
      onRequestEditMap: vi.fn(),
      onRenameGroup: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderMaps: vi.fn(),
      onUpdateMapOptions: vi.fn(),
      propsObjectId: null,
      setAddGroupOpen: vi.fn(),
      setAddMapOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageMapsOpen: vi.fn(),
      setNewGroupName: vi.fn(),
      setNewMapHeight: vi.fn(),
      setNewMapName: vi.fn(),
      setNewMapType: vi.fn(),
      setNewMapWidth: vi.fn(),
      setPropsObjectId: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
      },
      terrainDialogOpen: false,
      terrainDialogTarget: "paint",
      terrainDialogInitialTerrainId: null,
      terrainDialogInitialTiles: null,
      setTerrainDialogOpen: vi.fn(),
    }),
  );

  act(() => {
    dispatchClick(findButtonByText(rendered.container, "New Map"));
  });

  expect(onRequestCreateMap).toHaveBeenCalledWith(
    project.mapGroups[0]?.id ??
      ("map-group-1" as Project["mapGroups"][number]["id"]),
  );

  unmountRendered(rendered);
});

test("Manage Maps dialog edit opens the map options flow for that map", () => {
  const project = createProject();
  const onRequestEditMap = vi.fn();
  const rendered = render(
    createElement(MapPanelDialogs, {
      addGroupOpen: false,
      addMapOpen: false,
      deleteTarget: null,
      manageMapsOpen: true,
      manageMapsGroups: [
        {
          id: "map-group-1",
          name: "Maps",
          itemCount: 1,
          canDelete: true,
        },
      ],
      manageMapsItems: [{ id: "map-1", name: "Map One" }],
      mapOptionsOpen: false,
      mapOptionsMap: undefined,
      manageMapsSelectedGroupId:
        project.mapGroups[0]?.id ??
        ("map-group-1" as Project["mapGroups"][number]["id"]),
      newGroupName: "",
      newMapHeight: 15,
      newMapName: "Untitled Map",
      newMapType: "orthogonal",
      newMapWidth: 20,
      onApplyTerrainSelection: vi.fn(),
      onDeleteTerrain: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateMap: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onImportMapFromFile: vi.fn().mockResolvedValue(false),
      onMapOptionsOpenChange: vi.fn(),
      onManageMapsSelectedGroupChange: vi.fn(),
      onMoveMapToGroup: vi.fn(),
      onRequestCreateMap: vi.fn(),
      onRequestDeleteGroup: vi.fn(),
      onRequestEditMap,
      onRenameGroup: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderMaps: vi.fn(),
      onUpdateMapOptions: vi.fn(),
      propsObjectId: null,
      setAddGroupOpen: vi.fn(),
      setAddMapOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageMapsOpen: vi.fn(),
      setNewGroupName: vi.fn(),
      setNewMapHeight: vi.fn(),
      setNewMapName: vi.fn(),
      setNewMapType: vi.fn(),
      setNewMapWidth: vi.fn(),
      setPropsObjectId: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
      },
      terrainDialogOpen: false,
      terrainDialogTarget: "paint",
      terrainDialogInitialTerrainId: null,
      terrainDialogInitialTiles: null,
      setTerrainDialogOpen: vi.fn(),
    }),
  );

  act(() => {
    dispatchClick(
      rendered.container.querySelector(
        'button[aria-label="Edit map Map One"]',
      ) as HTMLElement,
    );
  });

  expect(onRequestEditMap).toHaveBeenCalledWith(
    project.maps[0]?.id ?? ("map-1" as Project["maps"][number]["id"]),
  );

  unmountRendered(rendered);
});

test("Manage Maps dialog shows a blocking alert when deleting a non-empty group", () => {
  const onRequestDeleteGroup = vi.fn();
  const project = createProject();
  const rendered = render(
    createElement(MapPanelDialogs, {
      addGroupOpen: false,
      addMapOpen: false,
      deleteTarget: null,
      manageMapsOpen: true,
      manageMapsGroups: [
        {
          id: "map-group-1",
          name: "Maps",
          itemCount: 2,
          canDelete: true,
        },
      ],
      manageMapsItems: [{ id: "map-1", name: "Map One" }],
      mapOptionsOpen: false,
      mapOptionsMap: undefined,
      manageMapsSelectedGroupId:
        project.mapGroups[0]?.id ??
        ("map-group-1" as Project["mapGroups"][number]["id"]),
      newGroupName: "",
      newMapHeight: 15,
      newMapName: "Untitled Map",
      newMapType: "orthogonal",
      newMapWidth: 20,
      onApplyTerrainSelection: vi.fn(),
      onDeleteTerrain: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateMap: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onImportMapFromFile: vi.fn().mockResolvedValue(false),
      onMapOptionsOpenChange: vi.fn(),
      onManageMapsSelectedGroupChange: vi.fn(),
      onMoveMapToGroup: vi.fn(),
      onRequestCreateMap: vi.fn(),
      onRequestDeleteGroup,
      onRequestEditMap: vi.fn(),
      onRenameGroup: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderMaps: vi.fn(),
      onUpdateMapOptions: vi.fn(),
      propsObjectId: null,
      setAddGroupOpen: vi.fn(),
      setAddMapOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageMapsOpen: vi.fn(),
      setNewGroupName: vi.fn(),
      setNewMapHeight: vi.fn(),
      setNewMapName: vi.fn(),
      setNewMapType: vi.fn(),
      setNewMapWidth: vi.fn(),
      setPropsObjectId: vi.fn(),
      state: {
        ...DEFAULT_EDITOR_STATE,
        project,
      },
      terrainDialogOpen: false,
      terrainDialogTarget: "paint",
      terrainDialogInitialTerrainId: null,
      terrainDialogInitialTiles: null,
      setTerrainDialogOpen: vi.fn(),
    }),
  );

  act(() => {
    dispatchClick(
      rendered.container.querySelector(
        'button[aria-label="Delete group Maps"]',
      ) as HTMLElement,
    );
  });

  expect(onRequestDeleteGroup).not.toHaveBeenCalled();
  expect(rendered.container.textContent).toContain(
    "Move or delete all maps in this group first.",
  );

  unmountRendered(rendered);
});

test("Manage Tilesets dialog New Group opens the tileset group dialog flow", () => {
  const project = createProject();
  const setAddGroupOpen = vi.fn();
  const setNewGroupName = vi.fn();
  const rendered = render(
    createElement(TilesetPanelDialogs, {
      activeTileset: null,
      addGroupOpen: false,
      animationDialogOpen: false,
      autotileDialogOpen: false,
      deleteTarget: null,
      editingAnimation: null,
      manageTilesetGroups: [
        {
          id: "tileset-group-1",
          name: "Tilesets",
          itemCount: 1,
          canDelete: false,
        },
      ],
      manageTilesetItems: [{ id: "tileset-1", name: "Terrain" }],
      manageTilesetsOpen: true,
      manageTilesetsSelectedGroupId:
        project.tilesetGroups[0]?.id ??
        ("tileset-group-1" as Project["tilesetGroups"][number]["id"]),
      newGroupName: "Existing",
      onCreateGroup: vi.fn(),
      onCreateTileset: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onDeleteEmptyGroup: vi.fn(),
      onDeleteTileset: vi.fn(),
      onMoveTilesetToGroup: vi.fn(),
      onRenameGroup: vi.fn(),
      onRenameTileset: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderTilesets: vi.fn(),
      onSaveAnimation: vi.fn(),
      onSaveAutotile: vi.fn(),
      setAddGroupOpen,
      setAnimationDialogOpen: vi.fn(),
      setAutotileDialogOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageTilesetsOpen: vi.fn(),
      setManageTilesetsSelectedGroupId: vi.fn(),
      setNewGroupName,
    }),
  );

  act(() => {
    dispatchClick(findButtonByText(rendered.container, "New Group"));
  });

  expect(setNewGroupName).toHaveBeenCalledWith("");
  expect(setAddGroupOpen).toHaveBeenCalledWith(true);

  unmountRendered(rendered);
});

test("Manage Tilesets dialog shows a blocking alert when deleting a non-empty group", () => {
  const onDeleteEmptyGroup = vi.fn();
  const project = createProject();
  const rendered = render(
    createElement(TilesetPanelDialogs, {
      activeTileset: null,
      addGroupOpen: false,
      animationDialogOpen: false,
      autotileDialogOpen: false,
      deleteTarget: null,
      editingAnimation: null,
      manageTilesetGroups: [
        {
          id: "tileset-group-1",
          name: "Tilesets",
          itemCount: 2,
          canDelete: true,
        },
      ],
      manageTilesetItems: [{ id: "tileset-1", name: "Terrain" }],
      manageTilesetsOpen: true,
      manageTilesetsSelectedGroupId:
        project.tilesetGroups[0]?.id ??
        ("tileset-group-1" as Project["tilesetGroups"][number]["id"]),
      newGroupName: "",
      onCreateGroup: vi.fn(),
      onCreateTileset: vi.fn(),
      onDeleteConfirm: vi.fn(),
      onDeleteEmptyGroup,
      onDeleteTileset: vi.fn(),
      onMoveTilesetToGroup: vi.fn(),
      onRenameGroup: vi.fn(),
      onRenameTileset: vi.fn(),
      onReorderGroups: vi.fn(),
      onReorderTilesets: vi.fn(),
      onSaveAnimation: vi.fn(),
      onSaveAutotile: vi.fn(),
      setAddGroupOpen: vi.fn(),
      setAnimationDialogOpen: vi.fn(),
      setAutotileDialogOpen: vi.fn(),
      setDeleteTarget: vi.fn(),
      setManageTilesetsOpen: vi.fn(),
      setManageTilesetsSelectedGroupId: vi.fn(),
      setNewGroupName: vi.fn(),
    }),
  );

  act(() => {
    dispatchClick(
      rendered.container.querySelector(
        'button[aria-label="Delete group Tilesets"]',
      ) as HTMLElement,
    );
  });

  expect(onDeleteEmptyGroup).not.toHaveBeenCalled();
  expect(rendered.container.textContent).toContain(
    "Move or delete all tilesets in this group first.",
  );

  unmountRendered(rendered);
});
