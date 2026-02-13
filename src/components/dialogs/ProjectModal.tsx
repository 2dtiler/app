import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Download, Trash2, Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listProjects, deleteProject, getProject, saveProject } from "@/lib/db";
import type { ProjectRecord } from "@/lib/db";
import { getEditorStore } from "@/lib/store";
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
import type { Project } from "@/types";

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
    layerGroups: [],
  };
}

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectLoaded: () => void;
}

export function ProjectModal({
  open,
  onOpenChange,
  onProjectLoaded,
}: ProjectModalProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const store = getEditorStore();
    store.setState((draft) => {
      draft.project = project;
      draft.activeTilesetGroupId = project.tilesetGroups[0]?.id ?? null;
      draft.activeMapGroupId = project.mapGroups[0]?.id ?? null;
      draft.activeTilesetId = null;
      draft.activeMapId = null;
      draft.activeLayerId = null;
      draft.tileSize = project.tileSize;
    });
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
    // Reset the input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(o);
        }}
      >
        <DialogContent
          className="sm:max-w-[480px]"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
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
                  onClick={() => setShowNewProject(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateProject}
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
                  onClick={() => setShowNewProject(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Project
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={handleImportProject}
                >
                  <FolderOpen className="mr-1 h-3.5 w-3.5" />
                  Import .2dp
                </Button>
              </div>

              {projects.length > 0 && (
                <ScrollArea className="h-[240px]">
                  <div className="space-y-1">
                    {projects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent group"
                      >
                        <button
                          className="flex-1 text-left text-sm truncate"
                          onClick={() => handleOpenProject(p)}
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
                              onClick={() => handleExportProject(p)}
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
                              onClick={() => setDeleteTarget(p)}
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
            <AlertDialogAction onClick={handleDeleteProject}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
