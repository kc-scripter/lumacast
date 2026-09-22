import { useEffect, type RefObject } from "react";

type OptimizedVideoOptions = {
  enabled?: boolean;
  rootMargin?: string;
  threshold?: number;
};

export function useOptimizedVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  { enabled = true, rootMargin = "120px 0px", threshold = 0.01 }: OptimizedVideoOptions = {},
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled || typeof IntersectionObserver === "undefined") return;

    let visible = true;
    let pausedByObserver = false;

    const pauseIfHidden = () => {
      if (visible || video.paused) return;
      pausedByObserver = true;
      video.pause();
    };

    const resumeIfVisible = () => {
      if (!visible || !pausedByObserver || !video.srcObject) return;
      pausedByObserver = false;
      void video.play().catch(() => {
        pausedByObserver = true;
      });
    };

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry) return;
        visible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (visible) resumeIfVisible();
        else pauseIfHidden();
      },
      { root: null, rootMargin, threshold },
    );

    const onPlay = () => pauseIfHidden();
    video.addEventListener("play", onPlay);
    observer.observe(video);

    return () => {
      observer.disconnect();
      video.removeEventListener("play", onPlay);
    };
  }, [enabled, rootMargin, threshold, videoRef]);
}
