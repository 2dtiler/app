import type { Project } from "@/types";
import {
  findNonSerializablePath,
  toPlainJson,
} from "@/utils/json-serialization";

export function sanitizeProjectForPersistence(project: Project): {
  project: Project;
  badPath: string | null;
} {
  const badPath = findNonSerializablePath(project, "project");
  if (!badPath) {
    return { project, badPath: null };
  }

  return {
    project: toPlainJson(project),
    badPath,
  };
}
