import { toast } from "sonner";
import { saveProject } from "@/services/db";
import { markEditorSaved } from "@/store/editor-store";
import type { Project } from "@/types";

export async function saveProjectAndMarkClean(project: Project): Promise<void> {
  await saveProject({ ...project, updatedAt: Date.now() });
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
