import { assert, test } from "vitest";
import { getLinkedImportResourceAccept } from "@/features/import-export/lib/linked-resource-utils";
import type { LinkedImportResourceKind } from "@/types";

test("returns accept filters for linked import resource kinds", () => {
  const expectedAcceptByKind: Record<LinkedImportResourceKind, string> = {
    tsx: ".tsx,.xml,text/xml,application/xml",
    tsj: ".tsj,.json,application/json,text/json",
    lua: ".lua,text/plain,application/octet-stream",
    image: ".png,.jpg,.jpeg,.gif,.bmp,.webp,image/*",
    json: ".json,application/json,text/json,text/plain,application/octet-stream",
    asset: ".asset,text/plain,application/octet-stream",
    meta: ".meta,text/plain,application/octet-stream",
    tilemap: ".tilemap,text/plain,application/octet-stream",
    tilesource: ".tilesource,text/plain,application/octet-stream",
    tscn: ".tscn,text/plain,application/octet-stream",
    tres: ".tres,text/plain,application/octet-stream",
    res: ".res,application/octet-stream",
  };

  for (const [kind, expectedAccept] of Object.entries(expectedAcceptByKind)) {
    assert.equal(
      getLinkedImportResourceAccept(kind as LinkedImportResourceKind),
      expectedAccept,
    );
  }
});
