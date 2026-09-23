import { memo } from "react";

export const AmbientBackground=memo(function AmbientBackground({variant="home"}:{variant?:"home"|"room"|"modal"}){
  const modal=variant==="modal";
  return <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <div className={`absolute inset-0 bg-[linear-gradient(to_right,#181824_1px,transparent_1px),linear-gradient(to_bottom,#181824_1px,transparent_1px)] bg-[size:3rem_3rem] ${modal?"opacity-20":"opacity-30"} [mask-image:radial-gradient(ellipse_72%_62%_at_50%_20%,#000_72%,transparent_100%)]`}/>
    <div className={`absolute rounded-full bg-purple-600/15 blur-[120px] transform-gpu ${variant==="room"?"-left-36 top-8 h-80 w-80":"-left-36 -top-36 h-96 w-96"}`}/>
    <div className={`absolute rounded-full bg-indigo-600/10 blur-[140px] transform-gpu ${modal?"-bottom-36 -right-28 h-80 w-80":"-bottom-44 -right-28 h-96 w-96"}`}/>
  </div>;
});
