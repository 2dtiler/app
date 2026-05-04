import { useEffect, useState } from "react";

export function useAnimationElapsedMs(hasAnimatedTileRefs: boolean) {
  const [animationElapsedMs, setAnimationElapsedMs] = useState(0);

  useEffect(() => {
    if (!hasAnimatedTileRefs) {
      setAnimationElapsedMs(0);
      return;
    }

    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      setAnimationElapsedMs(performance.now() - startedAt);
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [hasAnimatedTileRefs]);

  return animationElapsedMs;
}