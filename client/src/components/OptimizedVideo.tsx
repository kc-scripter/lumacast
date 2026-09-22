import { memo, useEffect, useRef, type RefObject } from "react";
import { useOptimizedVideo } from "../hooks/useOptimizedVideo";

type OptimizedVideoProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  className?: string;
};

export const OptimizedVideo = memo(function OptimizedVideo({ videoRef, muted = false, className }: OptimizedVideoProps) {
  return <video ref={videoRef} className={className} autoPlay playsInline muted={muted} />;
});

type OptimizedVideoTileProps = {
  track: MediaStreamTrack;
  className?: string;
};

export const OptimizedVideoTile = memo(function OptimizedVideoTile({ track, className }: OptimizedVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useOptimizedVideo(videoRef);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject) video.srcObject = null;
    };
  }, [track]);

  return <video ref={videoRef} className={className} autoPlay playsInline muted />;
}, (previous, next) => previous.track === next.track && previous.className === next.className);
