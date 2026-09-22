import { Component, type ErrorInfo, type ReactNode } from "react";

type Props={children:ReactNode};
type State={failed:boolean};

export class ErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return{failed:true};}
  componentDidCatch(error:unknown,info:ErrorInfo){console.error("LumaCast UI error",error,info);}
  render(){
    if(!this.state.failed)return this.props.children;
    return <main className="app-crash" role="alert"><div><span>LumaCast</span><h1>Algo deu errado nesta tela.</h1><p>A interface encontrou um erro inesperado. Recarregue o LumaCast para tentar recuperar a sessão.</p><button type="button" onClick={()=>location.reload()}>Recarregar LumaCast</button></div></main>;
  }
}
