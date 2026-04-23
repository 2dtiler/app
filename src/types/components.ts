import type { CSSProperties, ComponentProps, HTMLAttributes } from "react";

export type ColorPickerContextValue = {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  mode: string;
  setHue: (hue: number) => void;
  setSaturation: (saturation: number) => void;
  setLightness: (lightness: number) => void;
  setAlpha: (alpha: number) => void;
  setMode: (mode: string) => void;
};

export type ColorPickerProps = HTMLAttributes<HTMLDivElement> & {
  value?: unknown; // Parameters<typeof Color>[0]
  defaultValue?: unknown; // Parameters<typeof Color>[0]
  onChange?: (value: [number, number, number, number]) => void;
};

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

export type ColorPickerHueProps = {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  step?: number;
  dir?: "ltr" | "rtl";
  className?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
  style?: CSSProperties;
};

export type ColorPickerAlphaProps = {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  step?: number;
  dir?: "ltr" | "rtl";
  className?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  inverted?: boolean;
  minStepsBetweenThumbs?: number;
  style?: CSSProperties;
};

export type ColorPickerEyeDropperProps = {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
} & HTMLAttributes<HTMLButtonElement>;

export type ColorPickerOutputProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
} & HTMLAttributes<HTMLButtonElement>;

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>;

export type PercentageInputProps = ComponentProps<"input">;
