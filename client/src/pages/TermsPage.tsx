import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  FileText,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  UserCheck,
  Video,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { navigate } from "../services/navigation";

const termsSections=[
  {
    icon:<FileText/>,
    title:"1. Aceitação dos termos",
    body:[
      "Ao acessar ou usar o LumaCast, você concorda com estes Termos de Uso. Se você não concordar com eles, não utilize o serviço.",
      "Se a legislação aplicável exigir autorização de um responsável para que você aceite estes termos, use o LumaCast somente com essa autorização.",
    ],
  },
  {
    icon:<Video/>,
    title:"2. O que o LumaCast oferece",
    body:[
      "O LumaCast permite criar salas temporárias para compartilhar tela, câmera e áudio em tempo real pelo navegador. Uma sala pode reunir dono e participantes, e somente uma transmissão de tela fica ativa por vez.",
      "Resolução, FPS, áudio e disponibilidade de recursos dependem também do navegador, sistema operacional, dispositivo, hardware e conexão. Perfis como 1080p60, 720p40 ou 480p60 são metas solicitadas, não garantias absolutas.",
    ],
  },
  {
    icon:<UserCheck/>,
    title:"3. Sua responsabilidade",
    body:[
      "Você é responsável pelo conteúdo que decide transmitir e por garantir que possui autorização para compartilhar telas, imagens, áudio, informações, obras, arquivos ou qualquer outro material exibido durante a sessão.",
      "Você também é responsável por proteger códigos de sala e por não compartilhar acessos com pessoas que não deveriam participar.",
    ],
  },
  {
    icon:<Ban/>,
    title:"4. Usos proibidos",
    body:[
      "Não use o LumaCast para praticar atividades ilegais, violar direitos de terceiros, distribuir malware, tentar obter acesso não autorizado, explorar vulnerabilidades, assediar pessoas, transmitir conteúdo ilícito ou interferir deliberadamente no funcionamento do serviço.",
      "Também é proibido tentar contornar limites técnicos, mecanismos de segurança, rate limits, credenciais de sala ou controles de acesso.",
    ],
  },
  {
    icon:<Server/>,
    title:"5. Infraestrutura e serviços de terceiros",
    body:[
      "O LumaCast utiliza infraestrutura de terceiros para comunicação em tempo real. Atualmente, o compartilhamento de tela pode usar Agora como rota principal e LiveKit para câmera, áudio colaborativo e fallback de mídia.",
      "Para entregar a sessão, esses provedores processam a mídia e dados técnicos necessários enquanto a comunicação acontece. O LumaCast não possui recurso próprio de gravação do conteúdo das salas.",
      "A disponibilidade e o desempenho do serviço também podem depender da infraestrutura desses provedores.",
    ],
  },
  {
    icon:<RefreshCw/>,
    title:"6. Salas temporárias e disponibilidade",
    body:[
      "As salas são temporárias. O serviço pode manter informações mínimas de sessão pelo tempo necessário para permitir reconexões curtas e o funcionamento da sala.",
      "O LumaCast pode ficar temporariamente indisponível por manutenção, falhas de rede, problemas de navegador, incidentes em provedores externos ou alterações técnicas.",
      "O serviço não deve ser usado como sistema de emergência, missão crítica ou comunicação cuja interrupção possa causar dano grave.",
    ],
  },
  {
    icon:<LockKeyhole/>,
    title:"7. Segurança e privacidade",
    body:[
      "O LumaCast usa códigos de sala, credenciais temporárias e mecanismos de limitação de abuso para reduzir acesso indevido. Nenhum serviço conectado à internet, porém, pode ser considerado absolutamente imune a falhas.",
      "Evite transmitir informações extremamente sensíveis quando isso não for necessário e encerre a sessão quando terminar.",
    ],
  },
  {
    icon:<ShieldCheck/>,
    title:"8. Propriedade intelectual",
    body:[
      "O nome LumaCast, sua interface, identidade visual e código do produto pertencem aos seus respectivos titulares. O uso do serviço não transfere a você propriedade sobre esses elementos.",
      "Você continua responsável pelos direitos relacionados ao conteúdo que transmite e não concede ao LumaCast propriedade sobre esse conteúdo apenas por utilizá-lo durante uma sessão.",
    ],
  },
  {
    icon:<AlertTriangle/>,
    title:"9. Limitações do serviço",
    body:[
      "O serviço é fornecido na forma em que estiver disponível. Na medida permitida pela legislação aplicável, o LumaCast não garante funcionamento contínuo, ausência total de erros, FPS específico, compatibilidade com todo dispositivo ou qualidade idêntica em todas as conexões.",
      "O LumaCast não é responsável pelo conteúdo transmitido pelos usuários nem por falhas causadas por equipamentos, navegadores, redes ou serviços de terceiros fora de seu controle.",
      "Nada nestes termos limita direitos que não possam ser excluídos ou renunciados pela legislação aplicável.",
    ],
  },
  {
    icon:<FileText/>,
    title:"10. Alterações destes termos",
    body:[
      "Estes termos podem ser atualizados para refletir mudanças no LumaCast, em sua infraestrutura ou em requisitos legais. Quando houver uma alteração relevante, a data de atualização desta página será modificada.",
      "O uso do serviço após a publicação de uma versão atualizada significa que os novos termos passarão a reger esse uso, respeitados os direitos previstos na legislação aplicável.",
    ],
  },
];

export function TermsPage(){
  return <main className="terms-page">
    <header className="terms-nav">
      <Logo/>
      <button type="button" onClick={()=>navigate("/")}><ArrowLeft/>Voltar ao início</button>
    </header>

    <section className="terms-hero">
      <span className="terms-kicker"><FileText/>TERMOS DE USO</span>
      <h1>Regras simples para usar o <em>LumaCast.</em></h1>
      <p>Estes termos explicam o que o serviço oferece, o que esperamos de quem usa e quais limites técnicos fazem parte de uma plataforma de transmissão em tempo real.</p>
      <div className="terms-meta">
        <span><ShieldCheck/>Versão para lançamento</span>
        <span>Última atualização: 22 de setembro de 2026</span>
      </div>
    </section>

    <div className="terms-layout">
      <aside className="terms-summary">
        <b>Resumo rápido</b>
        <p>Use o LumaCast de forma legal e responsável, transmita apenas o que você pode compartilhar e proteja o acesso à sua sala.</p>
        <div><LockKeyhole/><span><strong>Salas temporárias</strong><small>Sem gravação própria da transmissão.</small></span></div>
        <div><Server/><span><strong>RTC de terceiros</strong><small>Agora e LiveKit processam mídia para entregar a sessão.</small></span></div>
        <div><UserCheck/><span><strong>Você controla o conteúdo</strong><small>Quem transmite responde pelo que compartilha.</small></span></div>
      </aside>

      <article className="terms-document">
        {termsSections.map(section=><section key={section.title}>
          <div className="terms-section-title"><span>{section.icon}</span><h2>{section.title}</h2></div>
          {section.body.map(paragraph=><p key={paragraph}>{paragraph}</p>)}
        </section>)}

        <div className="terms-note">
          <AlertTriangle/>
          <div>
            <b>Nota importante</b>
            <p>Este texto descreve as regras atuais do produto e foi preparado para o lançamento do LumaCast. Caso o serviço passe a operar por uma pessoa jurídica, tenha planos pagos, colete novos tipos de dados ou seja oferecido em novas jurisdições, estes termos devem ser revisados novamente.</p>
          </div>
        </div>
      </article>
    </div>

    <footer className="terms-footer">
      <span>© {new Date().getFullYear()} LumaCast</span>
      <div>
        <button type="button" onClick={()=>navigate("/como-funciona")}>Como funciona</button>
        <i>·</i>
        <button type="button" onClick={()=>navigate("/")}>Início</button>
      </div>
    </footer>
  </main>;
}
