import { Activity, ArrowRight, CircleHelp, Gauge, KeyRound, MonitorUp, Settings, Video, Zap } from "lucide-react";

const features=[
  {icon:Zap,title:"Baixa latência",text:"Transmissão em tempo real."},
  {icon:MonitorUp,title:"Web + Desktop",text:"A mesma sala nos dois clientes."},
  {icon:Gauge,title:"Qualidade de imagem",text:"Automático, 720p e 1080p."},
  {icon:Activity,title:"30 ou 60 FPS",text:"Escolha a taxa de quadros."},
  {icon:KeyRound,title:"Sala por código",text:"Entre usando 8 caracteres."},
  {icon:Video,title:"Câmera + áudio",text:"Recursos já disponíveis na sala."}
];

export function WelcomePage({onStart,onHow,onSettings}:{onStart:()=>void;onHow:()=>void;onSettings:()=>void}){
  return <main className="welcome-page">
    <nav className="welcome-actions" aria-label="Ações">
      <button type="button" onClick={onHow}><CircleHelp/>Como funciona</button>
      <button type="button" onClick={onSettings}><Settings/>Configurações</button>
    </nav>

    <section className="welcome-layout">
      <div className="welcome-copy">
        <span className="hero-kicker"><i/> LUNIRA SCREEN DESKTOP</span>
        <h1>Compartilhe sua tela.<br/><em>Do desktop para a web.</em></h1>
        <p>Use o mesmo sistema de salas do Lunira Screen Web com uma experiência feita para desktop.</p>

        <div className="welcome-feature-grid" aria-label="Recursos">
          {features.map(feature=>{const Icon=feature.icon;return <article className="welcome-feature" key={feature.title}>
            <span><Icon/></span>
            <div><strong>{feature.title}</strong><small>{feature.text}</small></div>
          </article>;})}
        </div>

        <button type="button" className="welcome-start" onClick={onStart}>
          <span>Começar agora</span>
          <small>Criar ou entrar em uma sala</small>
          <ArrowRight/>
        </button>
      </div>

      <div className="welcome-visual" aria-hidden="true">
        <div className="welcome-orbit orbit-a"/>
        <div className="welcome-orbit orbit-b"/>
        <div className="welcome-device desktop-device">
          <header><span className="device-dot"/><b>Lunira Desktop</b><i>AO VIVO</i></header>
          <div className="device-stage">
            <MonitorUp/>
            <strong>Tela compartilhada</strong>
            <small>1080p · 60 FPS</small>
          </div>
          <footer><span>AB3K7Q</span><small>Sala ativa</small></footer>
        </div>
        <div className="welcome-device web-device">
          <header><b>Lunira Web</b><i>Conectado</i></header>
          <div className="device-stage compact"><MonitorUp/><strong>Assistindo</strong></div>
          <footer><small>Mesmo código</small></footer>
        </div>
        <div className="welcome-link-line"><i/><span>Desktop ↔ Web</span><i/></div>
      </div>
    </section>

    <footer className="welcome-footer">
      <span>1 de 2</span>
      <div><i className="active"/><i/></div>
      <small>Depois você escolhe criar ou entrar em uma sala.</small>
    </footer>
  </main>;
}
