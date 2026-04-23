import { useRef, useState } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

async function resizeImage(
  file: File,
  maxSize: number = 1280,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      let { width, height } = image;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("No canvas context"));
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type));
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

export function ImageUpload({
  id,
  name,
  value,
  onChange,
  label,
}: {
  id: string;
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const resized = await resizeImage(file, 1280);
      onChange(resized);
    } catch (error) {
      console.error("Failed to resize image", error);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={`relative flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-left transition-colors ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:bg-muted/50"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <div className="relative w-full">
            <img
              src={value}
              alt="Upload preview"
              className="max-h-30 w-full object-contain"
            />
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
            <Upload className="mb-1 h-6 w-6 opacity-50" />
            <p>Drag &amp; drop an image here, or click to select</p>
          </div>
        )}
      </button>
    </div>
  );
}