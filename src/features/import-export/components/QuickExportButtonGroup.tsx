import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import type { QuickExportButtonGroupProps } from "@/types";

function getTooltipLabel(props: QuickExportButtonGroupProps) {
  if (props.state.disabled) {
    return props.state.disabledReason ?? "Quick export is unavailable.";
  }

  if (props.state.selectedOptionLabel) {
    return `Quick export using ${props.state.selectedOptionLabel}`;
  }

  return "Choose an export format, then quick export this asset.";
}

export function QuickExportButtonGroup(props: QuickExportButtonGroupProps) {
  return (
    <ButtonGroup className="rounded-lg border border-border-visible/80 bg-background/92 p-1 shadow-lg backdrop-blur-sm">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              id={props.buttonId}
              name={props.buttonName}
              type="button"
              size="xs"
              className="rounded-md"
              disabled={props.state.disabled || props.state.isExporting}
              onClick={props.state.onQuickExport}
            >
              <Download className="size-3" />
              {props.state.isExporting ? "Exporting..." : "Quick Export"}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>{getTooltipLabel(props)}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DropdownMenuTrigger asChild>
                <Button
                  id={props.dropdownButtonId}
                  name={props.dropdownButtonName}
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  className="rounded-md border-border-visible"
                  disabled={props.state.disabled}
                  aria-label={`Choose quick export format for ${props.state.assetType}`}
                >
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {props.state.selectedOptionLabel
              ? `Current format: ${props.state.selectedOptionLabel}`
              : "Choose a quick export format"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent side="top" align="end" className="w-72">
          <DropdownMenuLabel>
            {props.state.assetType === "map"
              ? "Map exports"
              : "Tileset exports"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={props.state.selectedOptionId ?? ""}
            onValueChange={(value) =>
              props.state.onSelectOption(value as never)
            }
          >
            {props.state.options.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  <div className="text-xs leading-4 text-muted-foreground">
                    {option.description}
                  </div>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
