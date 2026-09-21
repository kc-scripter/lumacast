import type { ReactNode } from "react";
import type { RoomParticipant } from "../types";
import { CameraDock } from "./ParticipantsSidebar";

type Props = {
  children: ReactNode;
  cameras: { identity: string; track: MediaStreamTrack; local: boolean }[];
  participants: RoomParticipant[];
};

export function RoomStage({ children, cameras, participants }: Props) {
  return (
    <section className={`room-stage ${cameras.length ? "with-cameras" : ""}`} aria-label="Transmissão e câmeras dos participantes">
      <div className="room-stage-screen">{children}</div>
      {cameras.length > 0 && <CameraDock cameras={cameras} participants={participants} />}
    </section>
  );
}
