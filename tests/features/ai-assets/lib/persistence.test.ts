import { afterEach, assert, test, vi } from "vitest";
import {
  createAiImageRecord,
  deleteAiImageRecord,
  getAiImageRecord,
  listAiImageHistory,
  listSavedAiImages,
  saveAiImageRecord,
  setAiImageSaved,
} from "@/features/ai-assets/lib/persistence";
import { db } from "@/services/db";
import type { AiGeneratedImageRecord } from "@/types/integrations/ai-assets";

const originals = {
  put: db.aiImages.put,
  get: db.aiImages.get,
  update: db.aiImages.update,
  delete: db.aiImages.delete,
  orderBy: db.aiImages.orderBy,
  toArray: db.aiImages.toArray,
};

afterEach(() => {
  db.aiImages.put = originals.put;
  db.aiImages.get = originals.get;
  db.aiImages.update = originals.update;
  db.aiImages.delete = originals.delete;
  db.aiImages.orderBy = originals.orderBy;
  db.aiImages.toArray = originals.toArray;
  vi.restoreAllMocks();
});

function installAiImageTableStub() {
  const store = new Map<string, AiGeneratedImageRecord>();

  db.aiImages.put = vi.fn(async (record) => {
    store.set(record.id, record);
    return record.id;
  }) as typeof db.aiImages.put;
  db.aiImages.get = vi.fn(async (id) =>
    store.get(id as string),
  ) as typeof db.aiImages.get;
  db.aiImages.update = vi.fn(async (id, changes) => {
    const record = store.get(id as string);
    if (!record) return 0;
    store.set(record.id, { ...record, ...changes });
    return 1;
  }) as typeof db.aiImages.update;
  db.aiImages.delete = vi.fn(async (id) => {
    store.delete(id as string);
  }) as typeof db.aiImages.delete;
  db.aiImages.orderBy = vi.fn(
    () =>
      ({
        reverse: () => ({
          toArray: async () =>
            [...store.values()].sort((left, right) => {
              return right.createdAt - left.createdAt;
            }),
        }),
      }) as ReturnType<typeof db.aiImages.orderBy>,
  ) as typeof db.aiImages.orderBy;
  db.aiImages.toArray = vi.fn(async () => [
    ...store.values(),
  ]) as typeof db.aiImages.toArray;

  return store;
}

test("persists generated image history and gallery state", async () => {
  installAiImageTableStub();
  const record = createAiImageRecord(
    {
      data: new Uint8Array([1]).buffer,
      mimeType: "image/png",
      prompt: "grass",
      provider: "huggingface",
      modelId: "model",
      modelLabel: "Model",
      width: 16,
      height: 16,
    },
    "record-1",
    10,
  );

  await saveAiImageRecord(record);
  assert.strictEqual((await getAiImageRecord("record-1"))?.prompt, "grass");
  assert.deepEqual(
    (await listAiImageHistory()).map((item) => item.id),
    ["record-1"],
  );
  assert.deepEqual(await listSavedAiImages(), []);

  await setAiImageSaved("record-1", true);
  assert.strictEqual((await listSavedAiImages())[0]?.id, "record-1");

  await setAiImageSaved("record-1", false);
  assert.deepEqual(await listSavedAiImages(), []);

  await deleteAiImageRecord("record-1");
  assert.strictEqual(await getAiImageRecord("record-1"), undefined);
});
