import { toast } from "sonner";
import { saveProject } from "@/services/db";
import { getEditorStore, markEditorSaved } from "@/store/editor-store";
import { sanitizeProjectForPersistence } from "@/features/project-management/lib/project-serialization";
import type { Project } from "@/types";

function syncSanitizedProjectIntoStore(
  project: Project,
  badPath: string | null,
): Project {
  if (!badPath) {
    return project;
  }

  getEditorStore().setState((draft) => {
    if (draft.project?.id === project.id) {
      draft.project = project;
    }
  });
  return project;
}

export async function saveProjectAndMarkClean(project: Project): Promise<void> {
  const { project: plainProject, badPath } =
    sanitizeProjectForPersistence(project);
  const liveProject = syncSanitizedProjectIntoStore(plainProject, badPath);
  await saveProject({ ...liveProject, updatedAt: Date.now() });
  markEditorSaved();
}

export async function saveProjectAndNotify(project: Project): Promise<void> {
  try {
    await saveProjectAndMarkClean(project);
  } catch (error) {
    console.error("[Save Project] Failed:", error);
    toast.error("Project could not be saved.");
  }
}
