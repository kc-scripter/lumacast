import { memo } from "react";

export const AmbientBackground=memo(function AmbientBackground({variant="home"}:{variant?:"home"|"room"|"modal"}){
  const room=variant==="room";
  const modal=variant==="modal";
  return <div className={"pointer-events-none absolute inset-0 -z-10 overflow-hidden "+(room?"lunira-ambient-room":"lunira-ambient")} aria-hidden="true">
    <div className={"ambient-lines absolute inset-0 "+(modal?"opacity-45":"opacity-70")}/>
    <div className="ambient-wash-a"/>
    <div className="ambient-wash-b"/>
    <div className="ambient-arc"/>
    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-purple-500/10 to-transparent"/>
  </div>;
});
