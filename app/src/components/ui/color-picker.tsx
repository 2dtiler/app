"use client";

import Color from "color";
import { PipetteIcon } from "lucide-react";
import { Slider } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  ColorPickerContextValue,
  ColorPickerProps,
  ColorPickerSelectionProps,
  ColorPickerHueProps,
  ColorPickerAlphaProps,
  ColorPickerEyeDropperProps,
  ColorPickerOutputProps,
  ColorPickerFormatProps,
} from "@/types";

// Re-export for backward compatibility
export type {
  ColorPickerProps,
  ColorPickerSelectionProps,
  ColorPickerHueProps,
  ColorPickerAlphaProps,
  ColorPickerEyeDropperProps,
  ColorPickerOutputProps,
  ColorPickerFormatProps,
} from "@/types";

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(
  undefined,
);

const useColorPicker = () => {
  const context = useContext(ColorPickerContext);

  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider");
  }

  return context;
};

export const ColorPicker = ({
  value,
  defaultValue = "#000000",
  onChange,
  className,
  ...props
}: ColorPickerProps) => {
  const selectedColor = Color(value as Parameters<typeof Color>[0]);
  const defaultColor = Color(defaultValue as Parameters<typeof Color>[0]);

  const [hue, setHue] = useState(
    selectedColor.hue() || defaultColor.hue() || 0,
  );
  const [saturation, setSaturation] = useState(
    selectedColor.saturationl() || defaultColor.saturationl() || 100,
  );
  const [lightness, setLightness] = useState(
    selectedColor.lightness() || defaultColor.lightness() || 50,
  );
  const [alpha, setAlpha] = useState(
    selectedColor.alpha() * 100 || defaultColor.alpha() * 100,
  );
  const [mode, setMode] = useState("hex");

  // Update color when controlled value changes
  useEffect(() => {
    if (value) {
      const color = Color.rgb(value).rgb().object();

      setHue(color.r);
      setSaturation(color.g);
      setLightness(color.b);
      setAlpha(color.a);
    }
  }, [value]);

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100);
      const rgba = color.rgb().array();

      onChange([rgba[0], rgba[1], rgba[2], alpha / 100]);
    }
  }, [hue, saturation, lightness, alpha, onChange]);

  return (
    <ColorPickerContext.Provider
      value={{
        hue,
        saturation,
        lightness,
        alpha,
        mode,
        setHue,
        setSaturation,
        setLightness,
        setAlpha,
        setMode,
      }}
    >
      <div
        className={cn("flex size-full flex-col gap-4", className)}
        {...props}
      />
    </ColorPickerContext.Provider>
  );
};

export const ColorPickerSelection = memo(
  ({ className, ...props }: ColorPickerSelectionProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [positionX, setPositionX] = useState(0);
    const [positionY, setPositionY] = useState(0);
    const { hue, setSaturation, setLightness } = useColorPicker();

    const backgroundGradient = useMemo(() => {
      return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`;
    }, [hue]);

    const handlePointerMove = useCallback(
      (event: PointerEvent) => {
        if (!(isDragging && containerRef.current)) {
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width),
        );
        const y = Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / rect.height),
        );
        setPositionX(x);
        setPositionY(y);
        setSaturation(x * 100);
        const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
        const lightness = topLightness * (1 - y);

        setLightness(lightness);
      },
      [isDragging, setSaturation, setLightness],
    );

    useEffect(() => {
      const handlePointerUp = () => setIsDragging(false);

      if (isDragging) {
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
      }

      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }, [isDragging, handlePointerMove]);

    return (
      <div
        className={cn("relative size-full cursor-crosshair rounded", className)}
        onPointerDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          handlePointerMove(e.nativeEvent);
        }}
        ref={containerRef}
        style={{
          background: backgroundGradient,
        }}
        {...props}
      >
        <div
          className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
          style={{
            left: `${positionX * 100}%`,
            top: `${positionY * 100}%`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>
    );
  },
);

ColorPickerSelection.displayName = "ColorPickerSelection";

export const ColorPickerHue = ({
  className,
  ...props
}: ColorPickerHueProps) => {
  const { hue, setHue } = useColorPicker();

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={([hue]) => setHue(hue)}
      step={1}
      value={[hue]}
      {...props}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
};

export const ColorPickerAlpha = ({
  className,
  ...props
}: ColorPickerAlphaProps) => {
  const { alpha, setAlpha } = useColorPicker();

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={([alpha]) => setAlpha(alpha)}
      step={1}
      value={[alpha]}
      {...props}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')] bg-center bg-repeat-x dark:bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR4nGP8+vWrCAMewM3N/QafPBM+SWLAqAGDwQBGQgoIpZOB98KoAVQwAADxzQcSVIRCfQAAAABJRU5ErkJggg==')]">
        <div className="absolute inset-0 rounded-full bg-linear-to-r from-transparent to-black/50 dark:to-white/50" />
        <Slider.Range className="absolute h-full rounded-full bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
};

export const ColorPickerEyeDropper = ({
  className,
  ...props
}: ColorPickerEyeDropperProps) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker();

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      const color = Color(result.sRGBHex);
      const [h, s, l] = color.hsl().array();

      setHue(h);
      setSaturation(s);
      setLightness(l);
      setAlpha(100);
    } catch (error) {
      console.error("EyeDropper failed:", error);
    }
  };

  return (
    <Button
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <PipetteIcon size={16} />
    </Button>
  );
};

const formats = ["hex", "rgb", "css", "hsl"];

export const ColorPickerOutput = ({
  className,
  ...props
}: ColorPickerOutputProps) => {
  const { mode, setMode } = useColorPicker();

  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger
        className={cn("h-8 w-20 shrink-0 text-xs", className)}
        {...props}
      >
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {formats.map((format) => (
          <SelectItem className="text-xs" key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

type PercentageInputProps = ComponentProps<typeof Input>;

const PercentageInput = ({
  className,
  WrapperClassName,
  ...props
}: PercentageInputProps & { WrapperClassName?: string }) => {
  return (
    <div className={cn("relative", WrapperClassName)}>
      <Input
        type="number"
        min={0}
        max={100}
        {...props}
        className={cn(
          "h-8 w-full bg-secondary px-2 pr-6 text-xs shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-auto [&::-webkit-outer-spin-button]:appearance-auto",
          className,
        )}
      />
      <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2 text-muted-foreground text-xs">
        %
      </span>
    </div>
  );
};

export const ColorPickerFormat = ({
  className,
  ...props
}: ColorPickerFormatProps) => {
  const {
    hue,
    saturation,
    lightness,
    alpha,
    mode,
    setHue,
    setSaturation,
    setLightness,
    setAlpha,
  } = useColorPicker();
  const color = Color.hsl(hue, saturation, lightness, alpha / 100);

  if (mode === "hex") {
    const hex = color.hex();

    return (
      <div
        className={cn("flex w-full items-center gap-1", className)}
        {...props}
      >
        <Input
          className="h-8 flex-1 min-w-0 bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={hex}
        />
        <PercentageInput
          value={alpha}
          WrapperClassName="flex-1 min-w-0"
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)));
            setAlpha(v);
          }}
        />
      </div>
    );
  }

  if (mode === "rgb") {
    const rgb = color
      .rgb()
      .array()
      .map((value) => Math.round(value));

    const handleRgbChange = (index: number, newValue: number) => {
      const current = color.rgb().array().map(Math.round);
      current[index] = Math.max(0, Math.min(255, newValue));
      const updated = Color.rgb(current[0], current[1], current[2]);
      const [h, s, l] = updated.hsl().array();
      setHue(h);
      setSaturation(s);
      setLightness(l);
    };

    return (
      <div
        className={cn("flex w-full items-center gap-1", className)}
        {...props}
      >
        {rgb.map((value, index) => (
          <Input
            className="h-8 flex-1 min-w-0 bg-secondary px-2 text-xs shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-auto [&::-webkit-outer-spin-button]:appearance-auto"
            key={index}
            min={0}
            max={255}
            type="number"
            value={value}
            onChange={(e) => handleRgbChange(index, Number(e.target.value))}
          />
        ))}
        <PercentageInput
          value={alpha}
          WrapperClassName="flex-1 min-w-0"
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)));
            setAlpha(v);
          }}
        />
      </div>
    );
  }

  if (mode === "css") {
    const rgb = color
      .rgb()
      .array()
      .map((value) => Math.round(value));

    return (
      <div className={cn("w-full rounded-md shadow-sm", className)} {...props}>
        <Input
          className="h-8 w-full bg-secondary px-2 text-xs shadow-none"
          readOnly
          type="text"
          value={`rgba(${rgb.join(", ")}, ${alpha}%)`}
          {...props}
        />
      </div>
    );
  }

  if (mode === "hsl") {
    const hsl = color
      .hsl()
      .array()
      .map((value) => Math.round(value));

    const handleHslChange = (index: number, newValue: number) => {
      const limits = [360, 100, 100];
      const clamped = Math.max(0, Math.min(limits[index], newValue));
      if (index === 0) setHue(clamped);
      else if (index === 1) setSaturation(clamped);
      else setLightness(clamped);
    };

    return (
      <div
        className={cn("flex w-full items-center gap-1", className)}
        {...props}
      >
        {hsl.map((value, index) => (
          <Input
            className="h-8 flex-1 min-w-0 bg-secondary px-2 text-xs shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-auto [&::-webkit-outer-spin-button]:appearance-auto"
            key={index}
            min={0}
            max={index === 0 ? 360 : 100}
            type="number"
            value={value}
            onChange={(e) => handleHslChange(index, Number(e.target.value))}
          />
        ))}
        <PercentageInput
          value={alpha}
          WrapperClassName="flex-1 min-w-0"
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value)));
            setAlpha(v);
          }}
        />
      </div>
    );
  }

  return null;
};
