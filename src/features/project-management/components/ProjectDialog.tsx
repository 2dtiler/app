import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import {
  deleteProject,
  deleteProjectPrefs,
  getProject,
  listProjects,
  saveProject,
} from "@/services/db";
import { saveByteArrayFile } from "@/services/file-system";
import { openProjectInEditor } from "@/features/project-management/lib/project-session";
import {
  generateMapGroupId,
  generateProjectId,
  generateTilesetGroupId,
} from "@/utils/ids";
import type { Project } from "@/types";
import type { ProjectDialogProps } from "@/types/app/dialogs";
import type { ProjectRecord } from "@/features/import-export/types";
import {
  exportProject,
  importProject,
  readFileAsUint8Array,
} from "@/utils/format";

function createNewProject(name: string): Project {
  const now = Date.now();
  return {
    id: generateProjectId(),
    name,
    createdAt: now,
    updatedAt: now,
    tileSize: 32,
    tilesetGroups: [{ id: generateTilesetGroupId(), name: "Main", order: 0 }],
    tilesets: [],
    mapGroups: [{ id: generateMapGroupId(), name: "Main", order: 0 }],
    maps: [],
    layers: [],
    imageLayers: [],
    layerGroups: [],
    terrains: [],
    objectLayers: [],
    objects: [],
    overrideTilesets: [],
  };
}

export function ProjectDialog({
  open,
  onOpenChange,
  onProjectLoaded,
}: ProjectDialogProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canClose = projects.length > 0;

  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setShowNewProject(false);
    setNewProjectName("");
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listProjects().then((list) => {
      if (!cancelled) {
        setProjects(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function loadProjects() {
    const list = await listProjects();
    setProjects(list);
  }

  function openProject(project: Project) {
    openProjectInEditor(project);
    onOpenChange(false);
    onProjectLoaded();
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;

    const project = createNewProject(name);
    await saveProject(project);
    openProject(project);
  }

  async function handleOpenProject(record: ProjectRecord) {
    const project = await getProject(record.id);
    if (project) {
      openProject(project);
    }
  }

  async function handleExportProject(record: ProjectRecord) {
    const project = await getProject(record.id);
    if (!project) return;
    const data = await exportProject(project);
    await saveByteArrayFile(data, `${project.name}.2dp`);
  }

  async function handleDeleteProject() {
    if (!deleteTarget) return;
    await deleteProject(deleteTarget.id);
    deleteProjectPrefs(deleteTarget.id);
    setDeleteTarget(null);
    await loadProjects();
  }

  function handleImportProject() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await readFileAsUint8Array(file);
      const project = await importProject(data);
      await saveProject(project);
      openProject(project);
    } catch (error) {
      console.error("Failed to import project:", error);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !canClose) return;
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          className="sm:max-w-120"
          showCloseButton={canClose}
          onInteractOutside={(event) => {
            if (!canClose) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!canClose) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>
              Create, open, or import a project to get started.
            </DialogDescription>
          </DialogHeader>

          {showNewProject ? (
            <div className="space-y-3 py-2">
              <Input
                id="project-name"
                name="project-name"
                placeholder="Project name"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && void handleCreateProject()
                }
                autoFocus
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={() => setShowNewProject(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onMouseDown={() => void handleCreateProject()}
                  disabled={!newProjectName.trim()}
                >
                  Create
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onMouseDown={() => setShowNewProject(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Project
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onMouseDown={handleImportProject}
                >
                  <FolderOpen className="mr-1 h-3.5 w-3.5" />
                  Import .2dp
                </Button>
              </div>

              {projects.length > 0 && (
                <ScrollArea className="h-60">
                  <div className="space-y-1">
                    {projects.map((projectRecord) => (
                      <div
                        key={projectRecord.id}
                        className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                      >
                        <button
                          type="button"
                          className="flex-1 truncate text-left text-sm"
                          onMouseDown={() =>
                            void handleOpenProject(projectRecord)
                          }
                        >
                          {projectRecord.name}
                        </button>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(
                            projectRecord.updatedAt,
                          ).toLocaleDateString()}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onMouseDown={() =>
                                void handleExportProject(projectRecord)
                              }
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                              onMouseDown={() => setDeleteTarget(projectRecord)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {projects.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No projects yet. Create one to get started.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        id="project-import-file"
        name="project-import-file"
        type="file"
        accept=".2dp"
        className="hidden"
        onChange={handleFileSelected}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all its
              tilesets and maps. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onMouseDown={() => void handleDeleteProject()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
