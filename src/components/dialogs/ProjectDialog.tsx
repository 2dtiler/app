import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
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
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { FolderOpen, Download, Trash2, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import {
  listProjects,
  deleteProject,
  getProject,
  saveProject,
  deleteProjectPrefs,
} from "@/lib/db";
import {
  generateProjectId,
  generateTilesetGroupId,
  generateMapGroupId,
} from "@/lib/ids";
import {
  exportProject,
  downloadFile,
  readFileAsUint8Array,
  importProject,
} from "@/lib/format";
import { openProjectInEditor } from "@/lib/project-session";
import type { Project } from "@/types";
import type { ProjectDialogProps } from "@/types/dialogs";
import type { ProjectRecord } from "@/types/persistence";

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
      if (!cancelled) setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function loadProjects() {
    const list = await listProjects();
    setProjects(list);
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;

    const project = createNewProject(name);

    await saveProject(project);
    openProject(project);
  }

  function openProject(project: Project) {
    openProjectInEditor(project);
    onOpenChange(false);
    onProjectLoaded();
  }

  async function handleOpenProject(record: ProjectRecord) {
    const project = await getProject(record.id);
    if (project) openProject(project);
  }

  async function handleExportProject(record: ProjectRecord) {
    const project = await getProject(record.id);
    if (!project) return;
    const data = await exportProject(project);
    downloadFile(data, `${project.name}.2dp`);
  }

  async function handleDeleteProject() {
    if (!deleteTarget) return;
    await deleteProject(deleteTarget.id);
    deleteProjectPrefs(deleteTarget.id);
    setDeleteTarget(null);
    await loadProjects();
  }

  async function handleImportProject() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readFileAsUint8Array(file);
      const project = await importProject(data);
      await saveProject(project);
      openProject(project);
    } catch (err) {
      console.error("Failed to import project:", err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !canClose) return;
          onOpenChange(o);
        }}
      >
        <DialogContent
          className="sm:max-w-120"
          showCloseButton={canClose}
          onInteractOutside={(e) => {
            if (!canClose) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!canClose) e.preventDefault();
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
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                autoFocus
              />
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onMouseDown={() => setShowNewProject(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onMouseDown={handleCreateProject}
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
                  size="sm"
                  className="flex-1"
                  onMouseDown={() => setShowNewProject(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Project
                </Button>
                <Button
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
                    {projects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent group"
                      >
                        <button
                          className="flex-1 text-left text-sm truncate"
                          onMouseDown={() => handleOpenProject(p)}
                        >
                          {p.name}
                        </button>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onMouseDown={() => handleExportProject(p)}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                              onMouseDown={() => setDeleteTarget(p)}
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
                <p className="text-center text-sm text-muted-foreground py-8">
                  No projects yet. Create one to get started.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".2dp"
        className="hidden"
        onChange={handleFileSelected}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
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
            <AlertDialogAction onMouseDown={handleDeleteProject}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
