import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, expect, test, vi } from "vitest";
import { MapPanelToolbar } from "@/features/map-editor/components/MapPanel/MapPanelToolbar";
import type { MapPanelToolbarProps } from "@/features/map-editor/types/map-panel";
import {
  DEFAULT_EDITOR_STATE,
  type ProjectId,
  type TerrainId,
  type TilesetGroupId,
  type TilesetId,
} from "@/types";

vi.mock("@/components/ui/DropdownMenu", async () => {
  const React = await import("react");

  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "dropdown-menu" }, children),
    DropdownMenuTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactNode;
    }) =>
      asChild
        ? children
        : React.createElement("button", { type: "button" }, children),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dropdown-menu-content" },
        children,
      ),
    DropdownMenuItem: ({
      children,
      disabled,
      onMouseDown,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
    }) =>
      React.createElement(
        "button",
        { disabled, onMouseDown, type: "button" },
        children,
      ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dropdown-menu-label" },
        children,
      ),
    DropdownMenuSeparator: () =>
      React.createElement("hr", { "data-slot": "dropdown-menu-separator" }),
    DropdownMenuSub: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dropdown-menu-sub" },
        children,
      ),
    DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dropdown-menu-sub-trigger" },
        children,
      ),
    DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-slot": "dropdown-menu-sub-content" },
        children,
      ),
  };
});

vi.mock("@/components/ui/Tooltip", async () => {
  const React = await import("react");

  return {
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tooltip" }, children),
    TooltipTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactNode;
    }) =>
      asChild
        ? children
        : React.createElement(
            "div",
            { "data-slot": "tooltip-trigger" },
            children,
          ),
    TooltipContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-slot": "tooltip-content" }, children),
  };
});

const PROJECT_ID = "project-1" as ProjectId;
const TILESET_GROUP_ID = "tileset-group-1" as TilesetGroupId;
const TILESET_ID = "tileset-1" as TilesetId;
const TERRAIN_ID = "terrain-1" as TerrainId;

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

function createToolbarProps(
  overrides: Partial<MapPanelToolbarProps> = {},
): MapPanelToolbarProps {
  const terrainTiles = [
    {
      probability: 100,
      tileRef: {
        tilesetId: TILESET_ID,
        sx: 0,
        sy: 0,
        sw: 16,
        sh: 16,
      },
    },
  ];

  return {
    activeMap: undefined,
    canCutToolbar: false,
    canOrientToolbar: false,
    controls: {
      back: vi.fn(),
      canBack: () => false,
      canForward: () => false,
      forward: vi.fn(),
    },
    mapZoom: 1,
    onCut: vi.fn(),
    onOpenMapOptions: vi.fn(),
    onOrientSelection: vi.fn(),
    onOpenTerrainDialog: vi.fn(),
    onSelectAutotileTool: vi.fn(),
    onSelectBrushTool: vi.fn(),
    onSelectFillMode: vi.fn(),
    onSelectFillTerrain: vi.fn(),
    onSelectPaintMode: vi.fn(),
    onSelectPaintTerrain: vi.fn(),
    onSelectTool: vi.fn(),
    onZoom: vi.fn(),
    state: {
      ...DEFAULT_EDITOR_STATE,
      project: {
        id: PROJECT_ID,
        name: "Project",
        createdAt: 0,
        updatedAt: 0,
        tileSize: 16,
        tilesetGroups: [{ id: TILESET_GROUP_ID, name: "Tilesets", order: 0 }],
        tilesets: [
          {
            id: TILESET_ID,
            name: "Terrain",
            groupId: TILESET_GROUP_ID,
            tileSize: 16,
            assetId: "asset-1",
            imageWidth: 32,
            imageHeight: 32,
            createdAt: 0,
          },
        ],
        mapGroups: [],
        maps: [],
        layers: [],
        imageLayers: [],
        layerGroups: [],
        terrains: [
          {
            id: TERRAIN_ID,
            name: "Grass",
            tiles: terrainTiles,
            tilesetId: TILESET_ID,
          },
        ],
        objectLayers: [],
        objects: [],
        overrideTilesets: [],
      },
      activeTilesetGroupId: TILESET_GROUP_ID,
      activeTilesetId: TILESET_ID,
      activePaintTerrain: terrainTiles,
      activeFillTerrain: terrainTiles,
      brushSize: "3x3",
      currentTool: "paint",
      fillMode: "fillTerrain",
      paintMode: "paintTerrain",
      selectedFillTerrainId: TERRAIN_ID,
      selectedPaintTerrainId: TERRAIN_ID,
    },
    ...overrides,
  };
}

async function renderToolbar(overrides: Partial<MapPanelToolbarProps> = {}) {
  installReactDomEnvironment();

  const props = createToolbarProps(overrides);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(MapPanelToolbar, props));
  });

  return {
    container,
    props,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function normalizeText(text: string | null) {
  return (text ?? "")
    .replace(/\s*✓\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findButtonByText(root: ParentNode, label: string) {
  const match = Array.from(root.querySelectorAll("button")).find(
    (button) => normalizeText(button.textContent) === label,
  );

  if (!(match instanceof window.HTMLElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return match;
}

function findSubByLabel(root: ParentNode, label: string) {
  const trigger = Array.from(
    root.querySelectorAll('[data-slot="dropdown-menu-sub-trigger"]'),
  ).find((element) => normalizeText(element.textContent) === label);

  if (!(trigger instanceof window.HTMLElement)) {
    throw new Error(`Submenu not found: ${label}`);
  }

  const submenu = trigger.closest('[data-slot="dropdown-menu-sub"]');
  if (!(submenu instanceof window.HTMLElement)) {
    throw new Error(`Submenu wrapper not found: ${label}`);
  }

  return submenu;
}

function dispatchMouseDown(element: HTMLElement) {
  element.dispatchEvent(new window.Event("mousedown", { bubbles: true }));
}

afterEach(() => {
  vi.clearAllMocks();

  if (originalDocument) {
    Object.assign(globalThis, { document: originalDocument });
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (originalWindow) {
    Object.assign(globalThis, { window: originalWindow });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  if (typeof originalActEnvironment === "boolean") {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

test("map panel toolbar exposes shared paint and fill terrain menu actions", async () => {
  const rendered = await renderToolbar();
  const { container, props } = rendered;

  expect(container.textContent).toContain("Paint Terrain");
  expect(container.textContent).toContain("Fill Terrain");

  const paintSubmenu = findSubByLabel(container, "Paint");
  const paintTerrainSubmenu = findSubByLabel(container, "Paint Terrain");
  const fillTerrainSubmenu = findSubByLabel(container, "Fill Terrain");
  const grassPaintSubmenu = findSubByLabel(paintTerrainSubmenu, "Grass");

  const paintSizeButton = paintSubmenu.querySelector("button");
  if (!(paintSizeButton instanceof window.HTMLElement)) {
    throw new Error("Paint size button not found.");
  }

  dispatchMouseDown(paintSizeButton);
  expect(props.onSelectBrushTool).toHaveBeenCalledWith("paint", "1x1");

  dispatchMouseDown(
    findButtonByText(paintTerrainSubmenu, "Create / New Terrain"),
  );
  expect(props.onOpenTerrainDialog).toHaveBeenCalledWith("paint");

  dispatchMouseDown(findButtonByText(grassPaintSubmenu, "4x4"));
  expect(props.onSelectPaintTerrain).toHaveBeenCalledWith(TERRAIN_ID, "4x4");

  dispatchMouseDown(
    findButtonByText(fillTerrainSubmenu, "Create / New Terrain"),
  );
  expect(props.onOpenTerrainDialog).toHaveBeenCalledWith("fill");

  dispatchMouseDown(findButtonByText(fillTerrainSubmenu, "Grass"));
  expect(props.onSelectFillTerrain).toHaveBeenCalledWith(TERRAIN_ID);

  await rendered.unmount();
});
