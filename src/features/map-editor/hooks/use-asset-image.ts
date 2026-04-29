import { useEffect, useState } from "react";
import type { AssetId } from "@/types";
import { getAssetUrl } from "@/services/db";

export function useAssetImage(
  assetId: AssetId | null,
): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previousAssetId, setPreviousAssetId] = useState(assetId);

  if (assetId !== previousAssetId) {
    setPreviousAssetId(assetId);
    if (!assetId) {
      setImage(null);
    }
  }

  useEffect(() => {
    if (!assetId) {
      return;
    }

    let revokeUrl: string | null = null;
    let cancelled = false;

    getAssetUrl(assetId).then((url) => {
      if (cancelled || !url) {
        return;
      }

      revokeUrl = url;
      const nextImage = new Image();
      nextImage.onload = () => {
        if (!cancelled) {
          setImage(nextImage);
        }
      };
      nextImage.src = url;
    });

    return () => {
      cancelled = true;
      if (revokeUrl) {
        URL.revokeObjectURL(revokeUrl);
      }
    };
  }, [assetId]);

  return image;
}
