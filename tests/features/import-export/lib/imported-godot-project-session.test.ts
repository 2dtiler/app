import { afterEach, expect, test, vi } from "vitest";
import { replaceWithImportedGodotProject } from "@/features/import-export/lib/imported-godot-project-session";
import type { GodotProjectImportResult, Project } from "@/types";
import type { EditorTravels } from "@/types/store";

const helperMocks = vi.hoisted(() => ({
  createEmptyProject: vi.fn(),
  getEditorStore: vi.fn(),
  mergeImportedMapData: vi.fn(),
  openProjectInEditor: vi.fn(),
  saveProject: vi.fn(),
  saveProjectAndMarkClean: vi.fn(),
}));

vi.mock("@/features/import-export/lib/imported-map-merge", () => ({
  mergeImportedMapData: helperMocks.mergeImportedMapData,
}));

vi.mock("@/features/project-management/lib/project", () => ({
  createEmptyProject: helperMocks.createEmptyProject,
}));

vi.mock("@/features/project-management/lib/project-save", () => ({
  saveProjectAndMarkClean: helperMocks.saveProjectAndMarkClean,
}));

vi.mock("@/features/project-management/lib/project-session", () => ({
  openProjectInEditor: helperMocks.openProjectInEditor,
}));

vi.mock("@/services/db", () => ({
  saveProject: helperMocks.saveProject,
}));

vi.mock("@/store/editor-store", () => ({
  getEditorStore: helperMocks.getEditorStore,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test("replaceWithImportedGodotProject replaces the active project with imported maps", async () => {
  const targetProject = {
    id: "project-1",
    name: "Imported Godot Project",
    mapGroups: [{ id: "map-group-1" }],
    tilesetGroups: [{ id: "tileset-group-1" }],
  } as unknown as Project;
  const importedProject = {
    ...targetProject,
    maps: [{ id: "map-1" }],
  } as unknown as Project;
  const result = {
    maps: [
      { map: { tileSize: 24, name: "Level 1" }, warnings: [] },
      { map: { tileSize: 24, name: "Level 2" }, warnings: [] },
    ],
    warnings: [],
  } as unknown as GodotProjectImportResult;
  const setState = vi.fn() as unknown as EditorTravels["setState"];

  helperMocks.createEmptyProject.mockReturnValue(targetProject);
  helperMocks.getEditorStore.mockReturnValue({
    getState: () => ({ project: importedProject }),
  });

  await replaceWithImportedGodotProject(
    result,
    "Imported Godot Project",
    setState,
  );

  expect(helperMocks.createEmptyProject).toHaveBeenCalledWith(
    "Imported Godot Project",
    16,
  );
  expect(helperMocks.saveProject).toHaveBeenCalledWith(targetProject);
  expect(helperMocks.openProjectInEditor).toHaveBeenCalledWith(targetProject);
  expect(helperMocks.mergeImportedMapData).toHaveBeenNthCalledWith(
    1,
    result.maps[0],
    targetProject,
    "map-group-1",
    "tileset-group-1",
    setState,
  );
  expect(helperMocks.mergeImportedMapData).toHaveBeenNthCalledWith(
    2,
    result.maps[1],
    targetProject,
    "map-group-1",
    "tileset-group-1",
    setState,
  );
  expect(helperMocks.saveProjectAndMarkClean).toHaveBeenCalledWith(
    importedProject,
  );
});

test("replaceWithImportedGodotProject passes through a valid tile size", async () => {
  const targetProject = {
    id: "project-1",
    name: "Imported Godot Project",
    mapGroups: [{ id: "map-group-1" }],
    tilesetGroups: [{ id: "tileset-group-1" }],
  } as unknown as Project;
  const importedProject = {
    ...targetProject,
    maps: [{ id: "map-1" }],
  } as unknown as Project;
  const result = {
    maps: [{ map: { tileSize: 32, name: "Level 1" }, warnings: [] }],
    warnings: [],
  } as unknown as GodotProjectImportResult;
  const setState = vi.fn() as unknown as EditorTravels["setState"];

  helperMocks.createEmptyProject.mockReturnValue(targetProject);
  helperMocks.getEditorStore.mockReturnValue({
    getState: () => ({ project: importedProject }),
  });

  await replaceWithImportedGodotProject(
    result,
    "Imported Godot Project",
    setState,
  );

  expect(helperMocks.createEmptyProject).toHaveBeenCalledWith(
    "Imported Godot Project",
    32,
  );
});
