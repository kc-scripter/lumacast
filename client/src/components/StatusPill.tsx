export function StatusPill({label,tone="neutral"}:{label:string;tone?:"live"|"good"|"warn"|"neutral"}) { return <span className={`status-pill ${tone}`}><i/>{label}</span>; }
