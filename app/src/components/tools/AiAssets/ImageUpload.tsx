import { useState } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

async function resizeImage(
  file: File,
  maxSize: number = 1280,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ImageUpload({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  label: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const resized = await resizeImage(file, 1280);
      onChange(resized);
    } catch (err) {
      console.error("Failed to resize image", err);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:bg-muted/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {value ? (
          <div className="relative w-full">
            <img
              src={value}
              alt="Upload preview"
              className="max-h-30 w-full object-contain"
            />
            <Button
              size="icon"
              variant="destructive"
              className="absolute -right-2 -top-2 h-6 w-6 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
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
      </div>
    </div>
  );
}
