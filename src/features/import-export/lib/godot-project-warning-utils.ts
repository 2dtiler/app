import type { GodotProjectImportResult } from "@/types";

export function showGodotProjectImportWarnings(
  warnings: GodotProjectImportResult["warnings"],
) {
  if (warnings.length === 0) return;

  alert(
    `Imported with ${warnings.length} Godot compatibility warning${
      warnings.length === 1 ? "" : "s"
    }. See the console for details.`,
  );
  console.warn("[Import Godot Project] Warnings:", warnings);
}
