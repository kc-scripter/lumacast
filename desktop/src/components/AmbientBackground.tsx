export function AmbientBackground(){
  return <div className="cosmos" aria-hidden="true">
    <div className="cosmos-stars cosmos-stars-near"/>
    <div className="cosmos-stars cosmos-stars-far"/>
    <svg className="cosmos-wave cosmos-wave-a" viewBox="0 0 1600 1000" preserveAspectRatio="none">
      <defs><linearGradient id="cosmosA" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#5a43de" stopOpacity=".04"/><stop offset=".35" stopColor="#654cff" stopOpacity=".54"/><stop offset=".7" stopColor="#ad61ff" stopOpacity=".24"/><stop offset="1" stopColor="#7754ff" stopOpacity=".52"/></linearGradient></defs>
      <path className="cosmos-wave-glow" d="M-90 256 C 170 330 334 644 628 679 S 998 507 1227 594 S 1437 831 1690 779" stroke="url(#cosmosA)" strokeWidth="17"/>
      <path className="cosmos-wave-core" d="M-90 256 C 170 330 334 644 628 679 S 998 507 1227 594 S 1437 831 1690 779" stroke="url(#cosmosA)" strokeWidth="1.7"/>
      <path className="cosmos-wave-thread" d="M-94 275 C 170 352 330 674 622 709 S 1000 530 1227 620 S 1440 862 1693 801" stroke="#7359ed" strokeWidth=".8"/>
    </svg>
    <svg className="cosmos-wave cosmos-wave-b" viewBox="0 0 1600 1000" preserveAspectRatio="none">
      <defs><linearGradient id="cosmosB" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#6050e8" stopOpacity=".3"/><stop offset=".48" stopColor="#9a64ff" stopOpacity=".05"/><stop offset=".72" stopColor="#8660ff" stopOpacity=".36"/><stop offset="1" stopColor="#a362ff" stopOpacity=".1"/></linearGradient></defs>
      <path className="cosmos-wave-glow" d="M-95 742 C 182 829 344 1025 658 1036 S 1044 742 1315 746 S 1525 919 1688 921" stroke="url(#cosmosB)" strokeWidth="13"/>
      <path className="cosmos-wave-core" d="M-95 742 C 182 829 344 1025 658 1036 S 1044 742 1315 746 S 1525 919 1688 921" stroke="url(#cosmosB)" strokeWidth="1.5"/>
    </svg>
    <div className="cosmos-shade"/>
  </div>;
}
