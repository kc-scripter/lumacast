import { Gauge, KeyRound, MonitorUp, RadioTower, Share2, Users } from "lucide-react";
import { Modal } from "./Modal";
const steps=[
  {n:"01",icon:MonitorUp,title:"Crie ou entre em uma sala",text:"Crie uma sala no desktop ou entre com o mesmo código de 8 caracteres usado no navegador."},
  {n:"02",icon:Share2,title:"Convide outras pessoas",text:"Copie o código ou o link web. Desktop e navegador entram na mesma sala."},
  {n:"03",icon:RadioTower,title:"Escolha o que transmitir",text:"Compartilhe sua tela em Automático, 720p ou 1080p, com 30 ou 60 FPS."},
  {n:"04",icon:Users,title:"Colabore em tempo real",text:"Participantes podem usar câmera e assumir a tela quando ela estiver livre."}
];
const features=[
  {icon:MonitorUp,title:"Tela em tempo real",text:"Compartilhe quando estiver pronto."},
  {icon:Gauge,title:"Até 1080p · 60 FPS",text:"Qualidade e FPS configuráveis."},
  {icon:Users,title:"Web + Desktop",text:"Compatíveis na mesma sala."},
  {icon:KeyRound,title:"Sala por código",text:"Entre usando 8 caracteres."}
];
export function HowItWorksDialog({onClose}:{onClose:()=>void}){
  return <Modal title="Compartilhe sua tela em poucos segundos." eyebrow="COMO FUNCIONA" onClose={onClose} className="how-modal">
    <p className="modal-lede">O app desktop usa as mesmas salas do Lunira Screen web. Quem está no navegador assiste o desktop e vice-versa.</p>
    <div className="steps-grid">{steps.map(step=>{const Icon=step.icon;return <article className="step-card" key={step.n}><div className="step-top"><span>{step.n}</span><Icon/></div><h3>{step.title}</h3><p>{step.text}</p></article>;})}</div>
    <div className="how-feature-grid">{features.map(feature=>{const Icon=feature.icon;return <div className="how-feature" key={feature.title}><span><Icon/></span><div><strong>{feature.title}</strong><small>{feature.text}</small></div></div>;})}</div>
  </Modal>;
}
