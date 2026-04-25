import type { LinkedImportResourceKind } from "@/types";

const LINKED_IMPORT_RESOURCE_ACCEPT_BY_KIND: Record<
  LinkedImportResourceKind,
  string
> = {
  tsx: ".tsx,.xml,text/xml,application/xml",
  tsj: ".tsj,.json,application/json,text/json",
  lua: ".lua,text/plain,application/octet-stream",
  image: ".png,.jpg,.jpeg,.gif,.bmp,.webp,image/*",
  tscn: ".tscn,text/plain,application/octet-stream",
  tres: ".tres,text/plain,application/octet-stream",
  res: ".res,application/octet-stream",
};

export function getLinkedImportResourceAccept(kind: LinkedImportResourceKind) {
  return LINKED_IMPORT_RESOURCE_ACCEPT_BY_KIND[kind];
}
