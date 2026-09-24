export function Brand({compact=false}:{compact?:boolean}){
  return <div className="brand" aria-label="Lunira Screen">
    <img className="brand-logo" src="/favicon.svg" alt="" />
    {!compact&&<div className="brand-copy"><strong>Lunira <span>Screen</span></strong><small>DESKTOP</small></div>}
  </div>;
}
