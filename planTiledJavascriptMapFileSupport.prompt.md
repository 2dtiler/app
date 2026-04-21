## Plan: Tiled JS Map Support

Add map-level `.js` import/export by treating Tiled JavaScript maps as the official Tiled JSON wrapper format, not as a separate map schema. Reuse the existing JSON import/export pipeline for resource discovery, parsing, serialization, and tileset/image handling; only add a thin JS unwrap/wrap layer plus the UI/action wiring. Because `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/import-export-tiled.ts` is already over 1000 lines, split its JSON/TMX/export-shared responsibilities before adding the new JS export path.

**Steps**

1. Phase 1: Refactor the oversized Tiled export module before feature work. Split `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/import-export-tiled.ts` into smaller export-focused modules so the shared bundle preparation, XML-specific writing, and JSON document construction live in separate files. Preserve the current public entry points used by `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/app/use-import-export-actions.ts` while moving shared helpers like bundle preparation, property conversion, GID encoding, and layer tree traversal into a reusable shared layer.
2. Phase 2: Introduce format metadata for JS map files. Extend the map format types in `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/types/import-export.ts` so the app can represent `js` alongside `xml` and `json` for map imports. Update UI-facing format labels and dialog props so JS is treated like a Tiled map format rather than a special case.
3. Phase 3: Wire JS import through the JSON import path. In `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/app/use-tiled-map-import.ts`, add `.js` to the picker accept list and dispatch `map-tiled-js` to a new `js` map format. In `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/tiled-map-import.ts` plus `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/tiled-map-import-json.ts`, add a small unwrap helper that strips Tiled’s official JavaScript wrapper `(function(name,data){...})(..., <json>);` down to the embedded JSON payload. Reuse the existing JSON resource collection and import code after unwrapping, so missing TSJ/TSX/image handling stays identical to JSON.
4. Phase 4: Reuse JSON export for JS output. Extract the existing JSON-map document creation in the Tiled export layer into a reusable helper that returns the root JSON object plus archive entries for images and external tilesets. Add a JS root writer that wraps that JSON exactly once using Tiled’s official JavaScript wrapper and emits a `.js` root file while leaving external tilesets as `.tsj` when `tilesetMode === "external"`. Keep inline tilesets identical to JSON export because Tiled’s JS map format is a wrapper around the same map object.
5. Phase 5: Update import/export dispatch and dialog behavior. In `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/dialogs/ImportExportDialog.tsx`, mark `map-tiled-js` as supported and include it anywhere the dialog currently groups `map-tiled-xml` and `map-tiled-json` as expandable Tiled map formats. In `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/app/use-import-export-actions.ts`, dispatch `map-tiled-js` import to the new JS format, dispatch export to the JS wrapper serializer, and choose `.js.zip` / multi-map archive naming that mirrors the existing TMX/TMJ flows.
6. Phase 6: Update missing-resource UX copy for JS imports. In `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/dialogs/TiledMissingResourcesDialog.tsx` and `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/types/dialogs.ts`, make the root-format label distinguish TMX vs Tiled JSON/Tiled JavaScript while keeping external tileset labels aligned with the JSON path, since JS map files still reference `.tsj` or `.tsx` resources.
7. Phase 7: Validate end to end. Verify single-map and multi-map export produce the correct root extension and archive structure, verify JS import works both for inline tilesets and for JS roots that reference external `.tsj` or `.tsx` plus images, and then run the repository-required checks.

**Relevant files**

- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/import-export-tiled.ts` — currently contains shared bundle prep plus both TMX and JSON export code; must be split before adding JS export logic.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/tiled-map-import.ts` — top-level import preparation and XML-vs-JSON dispatch; add JS routing here.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/lib/tiled-map-import-json.ts` — JSON parsing/resource discovery that JS import should reuse after wrapper removal.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/app/use-tiled-map-import.ts` — file picker accept strings, import labels, and pending import state.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/app/use-import-export-actions.ts` — map option dispatch for import/export and archive naming.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/dialogs/ImportExportDialog.tsx` — format registry, `supportedNow`, and expandable Tiled export option grouping.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/types/import-export.ts` — `ImportExportOptionId`, `TiledMapFormat`, and format option types.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/components/dialogs/TiledMissingResourcesDialog.tsx` — user copy for missing linked resources during JSON/JS import.
- `/Volumes/Samsung_SSD_1TB/www/2dtiler/app/src/types/dialogs.ts` — dialog prop types that carry the map format through the missing-resource flow.

**Verification**

1. Export one map as Tiled JavaScript with inline tilesets and confirm the zip contains a `.js` root whose payload matches the current JSON map object wrapped in Tiled’s loader function.
2. Export one map as Tiled JavaScript with external tilesets and confirm the zip contains a `.js` root plus `.tsj` tileset files and images, with relative paths resolving the same way as current JSON export.
3. Import a `.js` map generated by the app and confirm it round-trips into the same map/layers/tilesets/images as `.tmj` import.
4. Import a `.js` map that references external `.tsj` and image files and confirm the missing-resource dialog still prompts correctly and completes the import.
5. Run `bun run build` from `/Volumes/Samsung_SSD_1TB/www/2dtiler/app`.
6. Run `bun run lint` from `/Volumes/Samsung_SSD_1TB/www/2dtiler/app`.

**Decisions**

- Included scope: map-level `.js` import/export only.
- Excluded scope: `.js` tileset export/import. Tiled’s built-in JSON plugin exposes JavaScript as a map subformat while tilesets remain JSON, so this change should keep external tilesets as `.tsj` rather than inventing a new tileset format.
- Included behavior: support the official Tiled JavaScript wrapper format and its JSONP-style prefix/suffix trimming. Do not execute arbitrary JavaScript during import.
- Recommended implementation bias: build the JS format as a wrapper over the existing JSON object builder/parser so XML, JSON, and JS continue to share one source of truth for resource handling and map semantics.
