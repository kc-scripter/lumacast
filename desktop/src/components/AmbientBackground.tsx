export function AmbientBackground(){
  return <div className="ambient ambient-approved" aria-hidden="true">
    <span className="approved-starfield approved-starfield-a"/>
    <span className="approved-starfield approved-starfield-b"/>
    <span className="approved-starfield approved-starfield-c"/>

    <svg className="approved-wave approved-wave-top wave-layer-top" viewBox="0 0 1800 420" preserveAspectRatio="none">
      <defs>
        <linearGradient id="approvedTopWave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5643d8" stopOpacity=".03"/>
          <stop offset=".45" stopColor="#8f63ff" stopOpacity=".32"/>
          <stop offset=".7" stopColor="#6d55dd" stopOpacity=".14"/>
          <stop offset="1" stopColor="#41339d" stopOpacity=".02"/>
        </linearGradient>
      </defs>
      <path d="M-140 150 C 210 32, 430 246, 785 182 C 1110 124, 1360 34, 1940 160" fill="none" stroke="url(#approvedTopWave)" strokeWidth="34"/>
      <path d="M-140 150 C 210 32, 430 246, 785 182 C 1110 124, 1360 34, 1940 160" fill="none" stroke="#8e67ff" strokeOpacity=".30" strokeWidth="1.4"/>
    </svg>

    <svg className="approved-wave approved-wave-bottom" viewBox="0 0 1800 420" preserveAspectRatio="none">
      <defs>
        <linearGradient id="approvedBottomWave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4e3bb9" stopOpacity=".08"/>
          <stop offset=".58" stopColor="#6d50d7" stopOpacity=".14"/>
          <stop offset=".82" stopColor="#8d60f1" stopOpacity=".28"/>
          <stop offset="1" stopColor="#41339d" stopOpacity=".03"/>
        </linearGradient>
      </defs>
      <path d="M-180 304 C 160 190, 430 392, 790 326 C 1110 268, 1400 146, 1980 302" fill="none" stroke="url(#approvedBottomWave)" strokeWidth="38"/>
      <path d="M-180 304 C 160 190, 430 392, 790 326 C 1110 268, 1400 146, 1980 302" fill="none" stroke="#7858e9" strokeOpacity=".25" strokeWidth="1.2"/>
    </svg>

    <span className="approved-vignette"/>
  </div>;
}
