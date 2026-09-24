export function AmbientBackground(){
  return <div className="ambient ambient-waves" aria-hidden="true">
    <span className="ambient-glow ambient-glow-a"/><span className="ambient-glow ambient-glow-b"/>
    <svg className="wave-layer wave-layer-top" viewBox="0 0 1800 420" preserveAspectRatio="none">
      <defs><linearGradient id="luniraWaveTop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5d3cff" stopOpacity=".08"/><stop offset=".28" stopColor="#8157ff" stopOpacity=".38"/><stop offset=".55" stopColor="#b85cff" stopOpacity=".62"/><stop offset=".78" stopColor="#7758ff" stopOpacity=".34"/><stop offset="1" stopColor="#5539e7" stopOpacity=".04"/></linearGradient></defs>
      <path className="wave-soft" d="M-120 120 C 220 15, 420 260, 760 185 S 1230 40, 1920 220" fill="none" stroke="url(#luniraWaveTop)" strokeWidth="86"/>
      <path className="wave-line" d="M-120 120 C 220 15, 420 260, 760 185 S 1230 40, 1920 220" fill="none" stroke="#a968ff" strokeOpacity=".72" strokeWidth="2.2"/>
      <path className="wave-thread" d="M-150 145 C 210 42, 450 284, 785 205 S 1260 67, 1940 246" fill="none" stroke="#7a55f4" strokeOpacity=".28" strokeWidth="1.25"/>
    </svg>
    <svg className="wave-layer wave-layer-bottom" viewBox="0 0 1800 420" preserveAspectRatio="none">
      <defs><linearGradient id="luniraWaveBottom" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9a4fff" stopOpacity=".36"/><stop offset=".35" stopColor="#6745e8" stopOpacity=".13"/><stop offset=".62" stopColor="#7f4cf3" stopOpacity=".28"/><stop offset=".82" stopColor="#c061ff" stopOpacity=".52"/><stop offset="1" stopColor="#6b42ef" stopOpacity=".08"/></linearGradient></defs>
      <path className="wave-soft" d="M-140 248 C 220 70, 500 340, 850 235 S 1320 95, 1950 285" fill="none" stroke="url(#luniraWaveBottom)" strokeWidth="98"/>
      <path className="wave-line" d="M-140 248 C 220 70, 500 340, 850 235 S 1320 95, 1950 285" fill="none" stroke="#985dff" strokeOpacity=".52" strokeWidth="2"/>
      <path className="wave-thread" d="M-180 275 C 180 100, 510 360, 875 262 S 1350 122, 1980 310" fill="none" stroke="#b15dff" strokeOpacity=".22" strokeWidth="1.1"/>
    </svg>
    <span className="ambient-stars ambient-stars-a"/><span className="ambient-stars ambient-stars-b"/><span className="ambient-vignette"/>
  </div>;
}
