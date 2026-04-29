import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { countConfiguredAssignments } from "@/features/map-editor/lib/autotile-dialog";
import type { AutotileTerrainSidebarProps } from "@/features/map-editor/types/autotile-dialog";
import { cn } from "@/utils/cn";

export function AutotileTerrainSidebar({
  terrains,
  activeTerrainId,
  configuredSlotIds,
  onCreateRule,
  onDeleteRule,
  onSelectRule,
}: AutotileTerrainSidebarProps) {
  return (
    <aside
      role="region"
      aria-label="Autotile rules"
      className="flex min-h-0 flex-col rounded-xl border border-border bg-background/70 p-3"
    >
      <div className="mb-3 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Rules</h3>
          <p className="text-xs text-muted-foreground">
            Select a terrain rule to edit its paint tile and pattern tiles.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onMouseDown={onCreateRule}
        >
          <Plus />
          Create New Rule
        </Button>
      </div>

      {terrains.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-5 text-xs text-muted-foreground">
          No rules yet. Create one to start assigning a paint tile and pattern
          tiles.
        </div>
      ) : (
        <div
          role="list"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
        >
          {terrains.map((terrain, index) => {
            const configuredCount = countConfiguredAssignments(
              terrain,
              configuredSlotIds,
            );
            const isActive = terrain.id === activeTerrainId;

            return (
              <div
                key={terrain.id}
                role="listitem"
                className={cn(
                  "flex items-stretch gap-2 rounded-xl border p-2 transition-colors",
                  isActive
                    ? "border-foreground bg-secondary"
                    : "border-border bg-background hover:border-border-visible hover:bg-muted/20",
                )}
              >
                <button
                  type="button"
                  id={`autotile-rule-${terrain.id}`}
                  name={`autotile-rule-${terrain.id}`}
                  aria-pressed={isActive}
                  className="min-w-0 flex-1 text-left"
                  onMouseDown={() => onSelectRule(terrain.id)}
                >
                  <span className="block truncate text-sm font-medium text-foreground">
                    {terrain.name || `Rule ${index + 1}`}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {configuredCount}/{configuredSlotIds.length} configured
                  </span>
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="self-start text-destructive"
                  aria-label={`Delete ${terrain.name || `Rule ${index + 1}`}`}
                  onMouseDown={() => onDeleteRule(terrain.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
