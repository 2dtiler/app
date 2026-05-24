import { db } from "@/services/db";
import type {
  AiGeneratedImageInput,
  AiGeneratedImageRecord,
} from "@/types/integrations/ai-assets";

export function createAiImageRecord(
  input: AiGeneratedImageInput,
  id: string,
  createdAt = Date.now(),
): AiGeneratedImageRecord {
  return {
    ...input,
    id,
    createdAt,
    savedAt: null,
  };
}

export async function saveAiImageRecord(
  record: AiGeneratedImageRecord,
): Promise<void> {
  await db.aiImages.put(record);
}

export async function getAiImageRecord(
  id: string,
): Promise<AiGeneratedImageRecord | undefined> {
  return db.aiImages.get(id);
}

export async function listAiImageHistory(): Promise<AiGeneratedImageRecord[]> {
  return db.aiImages.orderBy("createdAt").reverse().toArray();
}

export async function listSavedAiImages(): Promise<AiGeneratedImageRecord[]> {
  const records = await db.aiImages.toArray();
  return records
    .filter((record) => record.savedAt !== null)
    .sort((left, right) => (right.savedAt ?? 0) - (left.savedAt ?? 0));
}

export async function setAiImageSaved(
  id: string,
  saved: boolean,
): Promise<void> {
  await db.aiImages.update(id, { savedAt: saved ? Date.now() : null });
}

export async function deleteAiImageRecord(id: string): Promise<void> {
  await db.aiImages.delete(id);
}
