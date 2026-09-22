import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { getBrowserDiagnostics } from "../services/browserDiagnostics";

export function BrowserCompatibilityNotice(){
  const diagnostics=useMemo(getBrowserDiagnostics,[]);
  if(!diagnostics.warnings.length)return null;
  return <div className="browser-compat-notice" role="status"><AlertTriangle/><span>{diagnostics.warnings.join(" ")}</span></div>;
}
