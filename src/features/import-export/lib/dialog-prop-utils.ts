export function selectOpenDialogProps<T extends { open: boolean }>(
  fallback: T,
  ...candidates: T[]
) {
  return candidates.find((props) => props.open) ?? fallback;
}
