import { Component, type ErrorInfo, type ReactNode } from "react";
import { buildDiagnosticReport,recordDiagnostic,submitDiagnosticReport } from "../services/diagnostics";

type Props={children:ReactNode;onRecover?:()=>void};
type State={failed:boolean;copied:boolean};

export class ErrorBoundary extends Component<Props,State>{
  state:State={failed:false,copied:false};
  private lastError:unknown=null;
  static getDerivedStateFromError():Partial<State>{return{failed:true,copied:false};}
  componentDidCatch(error:unknown,info:ErrorInfo){
    this.lastError=error;
    console.error("Lunira Screen UI error",error,info);
    recordDiagnostic("error","react","Falha capturada pelo ErrorBoundary",`${error instanceof Error?error.stack||error.message:String(error)}\n${info.componentStack}`);
    void submitDiagnosticReport({kind:"react-boundary"}).catch(()=>undefined);
  }
  private recover=()=>{
    this.lastError=null;
    this.setState({failed:false,copied:false},()=>this.props.onRecover?.());
  };
  private copyReport=async()=>{
    const report=buildDiagnosticReport({kind:"react-boundary",error:this.lastError instanceof Error?this.lastError.message:String(this.lastError||"")});
    try{await navigator.clipboard.writeText(report);this.setState({copied:true});setTimeout(()=>this.setState({copied:false}),1600);}catch{}
  };
  render(){
    if(!this.state.failed)return this.props.children;
    return <main className="app-crash" role="alert"><div><span>Lunira Screen</span><h1>Algo deu errado nesta tela.</h1><p>A sessão foi preservada. Tente reconstruir apenas esta interface; recarregue o aplicativo somente se o erro continuar.</p><div className="app-crash-actions"><button type="button" onClick={this.recover}>Tentar novamente</button><button type="button" className="secondary" onClick={()=>void this.copyReport()}>{this.state.copied?"Relatório copiado":"Copiar relatório"}</button><button type="button" className="secondary" onClick={()=>location.reload()}>Recarregar app</button></div></div></main>;
  }
}
