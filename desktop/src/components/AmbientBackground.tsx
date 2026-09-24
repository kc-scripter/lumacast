export function AmbientBackground(){
  return <div className="ambient ambient-waves" aria-hidden="true">
    <span className="ambient-glow ambient-glow-a"/>
    <span className="ambient-glow ambient-glow-b"/>

    <svg className="wave-layer wave-layer-top" viewBox="0 0 1800 500" preserveAspectRatio="none">
      <defs>
        <linearGradient id="luniraWaveTop" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5b43ea" stopOpacity=".05"/>
          <stop offset=".20" stopColor="#7654f4" stopOpacity=".24"/>
          <stop offset=".48" stopColor="#ac66ff" stopOpacity=".58"/>
          <stop offset=".70" stopColor="#8258f5" stopOpacity=".30"/>
          <stop offset="1" stopColor="#5a42de" stopOpacity=".04"/>
        </linearGradient>
        <linearGradient id="luniraWaveTopThin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8060ff" stopOpacity=".04"/>
          <stop offset=".45" stopColor="#d08aff" stopOpacity=".62"/>
          <stop offset="1" stopColor="#7655ff" stopOpacity=".06"/>
        </linearGradient>
      </defs>
      <path className="wave-haze" d="M-190 126 C 115 42, 340 230, 645 214 C 930 199, 1015 74, 1275 88 C 1515 101, 1730 250, 1990 218" fill="none" stroke="url(#luniraWaveTop)" strokeWidth="58"/>
      <path className="wave-ribbon" d="M-190 126 C 115 42, 340 230, 645 214 C 930 199, 1015 74, 1275 88 C 1515 101, 1730 250, 1990 218" fill="none" stroke="url(#luniraWaveTop)" strokeWidth="13"/>
      <path className="wave-line" d="M-190 126 C 115 42, 340 230, 645 214 C 930 199, 1015 74, 1275 88 C 1515 101, 1730 250, 1990 218" fill="none" stroke="url(#luniraWaveTopThin)" strokeWidth="2"/>
      <path className="wave-thread" d="M-220 160 C 105 72, 355 260, 675 244 C 950 230, 1055 106, 1305 120 C 1540 133, 1755 278, 2010 250" fill="none" stroke="#8059ef" strokeOpacity=".24" strokeWidth="1.15"/>
      <path className="wave-thread wave-thread-faint" d="M-180 88 C 145 8, 330 188, 620 176 C 900 164, 1015 42, 1255 54 C 1500 67, 1705 205, 1975 180" fill="none" stroke="#b676ff" strokeOpacity=".12" strokeWidth=".9"/>
    </svg>

    <svg className="wave-layer wave-layer-bottom" viewBox="0 0 1800 500" preserveAspectRatio="none">
      <defs>
        <linearGradient id="luniraWaveBottom" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a54fa" stopOpacity=".26"/>
          <stop offset=".25" stopColor="#6547db" stopOpacity=".10"/>
          <stop offset=".58" stopColor="#7c51ed" stopOpacity=".25"/>
          <stop offset=".82" stopColor="#bd6aff" stopOpacity=".50"/>
          <stop offset="1" stopColor="#6745e7" stopOpacity=".05"/>
        </linearGradient>
        <linearGradient id="luniraWaveBottomThin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d5bff" stopOpacity=".08"/>
          <stop offset=".70" stopColor="#c27aff" stopOpacity=".46"/>
          <stop offset="1" stopColor="#7450ed" stopOpacity=".05"/>
        </linearGradient>
      </defs>
      <path className="wave-haze" d="M-180 315 C 135 170, 430 374, 760 305 C 1020 251, 1195 155, 1455 196 C 1650 226, 1800 340, 1990 330" fill="none" stroke="url(#luniraWaveBottom)" strokeWidth="64"/>
      <path className="wave-ribbon" d="M-180 315 C 135 170, 430 374, 760 305 C 1020 251, 1195 155, 1455 196 C 1650 226, 1800 340, 1990 330" fill="none" stroke="url(#luniraWaveBottom)" strokeWidth="14"/>
      <path className="wave-line" d="M-180 315 C 135 170, 430 374, 760 305 C 1020 251, 1195 155, 1455 196 C 1650 226, 1800 340, 1990 330" fill="none" stroke="url(#luniraWaveBottomThin)" strokeWidth="1.8"/>
      <path className="wave-thread" d="M-210 348 C 120 200, 450 407, 785 338 C 1045 284, 1218 188, 1475 228 C 1672 258, 1820 372, 2010 362" fill="none" stroke="#9b5eff" strokeOpacity=".20" strokeWidth="1"/>
      <path className="wave-thread wave-thread-faint" d="M-150 277 C 160 137, 410 335, 735 269 C 998 216, 1170 120, 1438 160 C 1635 190, 1785 302, 1970 294" fill="none" stroke="#6f50e5" strokeOpacity=".13" strokeWidth=".9"/>
    </svg>

    <span className="ambient-stars ambient-stars-a"/>
    <span className="ambient-stars ambient-stars-b"/>
    <span className="ambient-vignette"/>
  </div>;
}
