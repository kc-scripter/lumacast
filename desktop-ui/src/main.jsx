import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell, Camera, Check, ChevronDown, Copy, Crown, Film, Gauge, Grid2X2,
  HelpCircle, Link, LogOut, Maximize2, MoreHorizontal, MonitorUp, Moon,
  PanelRight, Plus, Radio, Settings, ShieldCheck, SlidersHorizontal,
  Sparkles, Sun, Users, Video, Volume2, Wifi, X
} from 'lucide-react';
import { useCollaborativeRoom } from '../../client/src/services/useCollaborativeRoom';
import { copyText, safeSessionGet, safeSessionRemove, safeSessionSet } from '../../client/src/services/browser';
import { getSocket } from '../../client/src/services/socket';
import './styles.css';

const IconButton = ({ icon: Icon, label, active, danger, onClick, compact, disabled }) => (
  <button
    type="button"
    className={`icon-button ${active ? 'active' : ''} ${danger ? 'danger' : ''} ${compact ? 'compact' : ''}`}
    onClick={onClick}
    aria-label={label}
    title={label}
    disabled={disabled}
  ><Icon size={compact ? 17 : 19}/></button>
);

function Brand() {
  return <div className="brand"><span className="brand-mark"><span/></span><span>Lunira<span>Screen</span></span></div>;
}

function Nav({ page, setPage, hasRoom }) {
  return <aside className="app-nav">
    <Brand/>
    <div className="nav-links">
      <button className={page === 'home' ? 'selected' : ''} onClick={() => setPage('home')}><Grid2X2/>Início</button>
      <button className={page === 'room' ? 'selected' : ''} disabled={!hasRoom} onClick={() => hasRoom && setPage('room')}><Radio/>Sala</button>
    </div>
    <div className="nav-bottom">
      <button className={page === 'settings' ? 'selected' : ''} onClick={() => setPage('settings')}><Settings/>Configurações</button>
      <div className="profile">
        <div className="avatar avatar-me">{(safeSessionGet('lumacast-display-name') || 'LS').slice(0,2).toUpperCase()}</div>
        <div><strong>{safeSessionGet('lumacast-display-name') || 'Você'}</strong><small>{hasRoom ? 'Em uma sala' : 'Disponível'}</small></div>
        <MoreHorizontal size={18}/>
      </div>
    </div>
  </aside>;
}

function Stat({icon: Icon, label, value}) {
  return <div className="stat"><div className="stat-icon"><Icon size={16}/></div><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function ClockIcon(props) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>;
}

function Home({ onCreate, onJoin }) {
  const [name, setName] = useState(() => safeSessionGet('lumacast-display-name') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const create = () => {
    const clean = name.trim();
    if (!clean) { setError('Digite seu nome antes de criar a sala.'); return; }
    setError('');
    onCreate(clean);
  };

  const join = () => {
    const cleanName = name.trim();
    const cleanCode = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!cleanName) { setError('Digite seu nome antes de entrar.'); return; }
    if (cleanCode.length < 6) { setError('Digite um código de sala válido.'); return; }
    setError('');
    onJoin(cleanName, cleanCode);
  };

  return <main className="home page-enter">
    <header className="topbar">
      <div><span className="eyebrow">LUNIRASCREEN DESKTOP</span><h2>Seu espaço para compartilhar.</h2></div>
      <div className="top-actions"><button className="top-icon"><Bell size={18}/><i/></button><div className="status"><span/> Tudo certo</div></div>
    </header>
    <section className="home-layout">
      <div className="welcome">
        <div className="orb orb-one"/>
        <span className="eyebrow accent"><Sparkles size={14}/> PRONTO QUANDO VOCÊ ESTIVER</span>
        <h1>Compartilhe sua tela<br/><em>sem interrupções.</em></h1>
        <p>Crie uma sala privada e comece a transmitir em segundos. Simples, seguro e com qualidade máxima.</p>
        <div className="action-card">
          <div className="form-title"><div className="mini-icon"><Plus size={17}/></div><div><strong>Nova sala</strong><small>Comece uma transmissão privada</small></div></div>
          <label>SEU NOME<input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()} placeholder="Como as pessoas vão ver você?"/></label>
          <button className="primary-button" onClick={create}>Criar sala privada <span><Video size={18}/></span></button>
          {error && <div className="home-error">{error}</div>}
        </div>
        <div className="join-row">
          <div><span>Já tem uma sala?</span><strong>Entre com o código</strong></div>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&join()} maxLength="10" placeholder="XXXXXXXX"/>
          <button className="ghost-button" onClick={join}>Entrar</button>
        </div>
      </div>
      <div className="home-preview">
        <div className="preview-window">
          <div className="window-bar"><div className="dots"><i/><i/><i/></div><span>Prévia da sala</span><Maximize2 size={15}/></div>
          <div className="preview-stage"><div className="preview-glow"/><div className="preview-content"><MonitorUp size={42}/><strong>Sua transmissão<br/>aparece aqui</strong><span>As câmeras ficam embaixo, sem ocupar o palco.</span></div></div>
          <div className="preview-members"><div className="avatar-stack"><div className="avatar avatar-me">LS</div><div className="avatar muted"><Plus size={15}/></div></div><span>Aguardando participantes</span><div className="live-dot">PREVIEW</div></div>
        </div>
        <div className="specs"><Stat icon={ShieldCheck} label="Sala" value="Privada"/><Stat icon={ClockIcon} label="Duração" value="Temporária"/><Stat icon={MonitorUp} label="Qualidade" value="1080p"/><Stat icon={Gauge} label="Fluidez" value="60 FPS"/></div>
      </div>
    </section>
  </main>;
}

function TrackVideo({ track, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [track]);
  return <video ref={ref} className="camera-video" autoPlay playsInline muted={muted}/>;
}

function Room({ session, onLeave, quality, fps }) {
  const room = useCollaborativeRoom(session.owner, session.roomId);
  const [statsOpen,setStatsOpen]=useState(false);
  const [panel,setPanel]=useState(true);
  const [copied,setCopied]=useState(false);
  const selfName = safeSessionGet('lumacast-display-name') || 'Você';
  const roomCode = room.roomId || session.roomId || '—';
  const participants = room.roomState.participants || [];
  const participantName = id => participants.find(p=>p.id===id)?.displayName || 'Participante';
  const live = room.roomState.live;
  const busy = !!room.roomState.activeScreenSharerId && !room.ownsScreenLock;
  const screenStarting = !!room.roomState.activeScreenSharerId && !live;

  const copyCode = async () => {
    if (!roomCode || roomCode === '—') return;
    try {
      await copyText(roomCode);
      setCopied(true);
      setTimeout(()=>setCopied(false),1400);
    } catch { room.setError('Não foi possível copiar o código.'); }
  };

  const copyInvite = async () => {
    if (!roomCode || roomCode === '—') return;
    try { await copyText(`https://lunirascreen.onrender.com/?room=${encodeURIComponent(roomCode)}`); }
    catch { room.setError('Não foi possível copiar o convite.'); }
  };

  const toggleShare = async () => {
    if (room.isScreenSharer) await room.stopScreen();
    else await room.startScreen(quality, fps);
  };

  const leave = async () => {
    try { if (room.isScreenSharer) await room.stopScreen(); } catch {}
    getSocket().disconnect();
    onLeave();
  };

  const cameraCards = room.cameras.map(camera => ({
    ...camera,
    name: camera.local ? selfName : participantName(camera.identity),
    local: camera.local
  }));

  const latency = room.stats?.rttMs == null ? '—' : `${Math.round(room.stats.rttMs)} ms`;
  const bitrate = room.stats?.bitrateKbps == null ? '—' : `${(room.stats.bitrateKbps/1000).toFixed(1)} Mbps`;
  const loss = room.stats?.packetsLost == null ? '—' : String(room.stats.packetsLost);

  return <main className="room page-enter">
    <header className="room-header">
      <div className="room-heading">
        <span className="live-indicator"><i/> {live ? 'AO VIVO' : room.status.toUpperCase()}</span>
        <div><h2>Sala privada</h2><span>{participants.length || room.roomState.count || 1} participante(s)</span></div>
      </div>
      <div className="room-code"><span>CÓDIGO DA SALA</span><strong>{roomCode}</strong><button onClick={()=>void copyCode()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copiado':'Copiar'}</button></div>
      <div className="header-buttons">
        <IconButton icon={Users} label="Participantes" active={panel} onClick={()=>setPanel(!panel)}/>
        <IconButton icon={PanelRight} label="Painel" active={panel} onClick={()=>setPanel(!panel)}/>
        <button className="end-button" onClick={()=>void leave()}><LogOut size={17}/> Sair</button>
      </div>
    </header>

    <div className={`room-layout ${panel ? '' : 'panel-closed'}`}>
      <section className="stream-area">
        <div className="stream-frame">
          <div className="stream-toolbar">
            <span><MonitorUp size={15}/> {room.roomState.activeScreenSharerName ? `${room.roomState.activeScreenSharerName} está compartilhando` : 'Área de transmissão'}</span>
            <span className="quality"><Wifi size={14}/> {room.status} · {quality.toUpperCase()} / {room.stats?.fps ?? fps} FPS</span>
          </div>
          <div className={`screen-art ${live ? 'is-live' : ''}`}>
            <video ref={room.videoRef} className="desktop-screen-video" autoPlay playsInline muted={room.isScreenSharer}/>
            <div className="screen-empty"><MonitorUp size={44}/><strong>{screenStarting ? 'Preparando a transmissão…' : 'Nenhuma tela sendo compartilhada'}</strong><span>{busy ? 'Outra pessoa está iniciando uma transmissão.' : 'Qualquer pessoa da sala pode compartilhar a tela.'}</span></div>
            {room.switching && <div className="share-caption"><MonitorUp/><div><strong>Trocando servidor de transmissão…</strong><span>A conexão será retomada automaticamente.</span></div></div>}
          </div>
          <button className="expand" title="Foco"><Maximize2 size={18}/></button>
        </div>

        <div className="camera-dock">
          <div className="dock-title"><span>CÂMERAS</span><span>{cameraCards.length ? `${cameraCards.length} ligada(s)` : 'Nenhuma ligada'}</span></div>
          {cameraCards.length > 0 ? <div className="camera-row">{cameraCards.slice(0,6).map((camera,i)=>
            <div className="camera-card" key={camera.identity}>
              <div className={`camera-visual ${i%2 ? 'marina' : 'rafael'}`}>
                <span className="avatar big">{camera.name.slice(0,2).toUpperCase()}</span>
                <TrackVideo track={camera.track} muted={camera.local}/>
                {camera.local && <span className="camera-live"><Camera size={12}/> VOCÊ</span>}
              </div>
              <div className="camera-label"><strong>{camera.name}</strong><span>{camera.local ? 'Sua câmera' : 'Na sala'}</span></div>
            </div>
          )}</div> : <div className="room-status-note">As câmeras aparecem aqui quando alguém ativar uma.</div>}
        </div>
      </section>

      {panel && <aside className="room-panel">
        <div className="panel-title"><div><span className="eyebrow">SALA ATIVA</span><h3>Detalhes</h3></div><button onClick={()=>setPanel(false)}><X size={18}/></button></div>
        <div className="connection-card">
          <div className="connection-top"><span className="connection-icon"><Wifi size={18}/></span><div><strong>{room.status === 'Conectado' ? 'Conexão estabelecida' : room.status}</strong><small>{room.roomState.screenProvider === 'agora' ? 'Agora + LiveKit' : 'LiveKit fallback'}</small></div><span className="latency">{latency}</span></div>
          <div className="signal"><i/><i/><i/><i/><i/></div>
          <div className="connection-details"><span>Bitrate <strong>{bitrate}</strong></span><span>Perda <strong>{loss}</strong></span></div>
        </div>

        <div className="people-panel">
          <div className="section-heading"><div><h4>Participantes <b>{participants.length || room.roomState.count || 1}</b></h4><span>{room.status}</span></div><button onClick={()=>void copyInvite()}><Plus size={16}/> Convidar</button></div>
          {(participants.length ? participants : [{id:'self',displayName:selfName}]).map((p,i)=>
            <div className="person" key={p.id || i}>
              <div className={`avatar ${i===0?'avatar-me':''}`}>{(p.displayName || 'P').slice(0,2).toUpperCase()}</div>
              <div><strong>{p.displayName || 'Participante'} {p.displayName===room.roomState.ownerName&&<Crown size={13}/>}</strong><small><i/> {p.id===room.roomState.activeScreenSharerId ? 'Compartilhando tela' : 'Conectado'}</small></div>
              <button><MoreHorizontal size={18}/></button>
            </div>
          )}
        </div>

        <div className="panel-footer"><button onClick={()=>void copyInvite()}><Link size={16}/> Copiar link da sala</button><button><HelpCircle size={16}/> Ajuda</button></div>
      </aside>}
    </div>

    <div className="control-dock">
      <IconButton icon={Camera} label="Câmera" active={room.cameraOn} onClick={()=>void room.toggleCamera()}/>
      <IconButton icon={MonitorUp} label={room.isScreenSharer ? 'Parar compartilhamento' : 'Compartilhar tela'} active={room.isScreenSharer} disabled={busy} onClick={()=>void toggleShare()}/>
      <IconButton icon={room.muted ? Volume2 : Volume2} label={room.muted ? 'Ativar áudio do sistema' : 'Áudio do sistema'} active={room.isScreenSharer && !room.muted} disabled={!room.isScreenSharer} onClick={()=>void room.toggleScreenAudio()}/>
      <span className="dock-divider"/>
      <IconButton icon={Gauge} label="Estatísticas" active={statsOpen} onClick={()=>setStatsOpen(!statsOpen)}/>
      <span className="dock-divider"/>
      <IconButton icon={LogOut} label="Sair da sala" danger onClick={()=>void leave()}/>
    </div>

    {statsOpen && <div className="stats-popover"><div><span>ESTATÍSTICAS</span><button onClick={()=>setStatsOpen(false)}><X size={15}/></button></div><p><b>{room.stats?.resolution || quality.toUpperCase()}</b> Resolução</p><p><b>{room.stats?.fps ?? fps}</b> FPS</p><p><b>{bitrate}</b> Bitrate</p><p><b>{latency}</b> RTT</p></div>}
    {room.error && <div className="room-error" role="alert">{room.error}</div>}
  </main>;
}

function Toggle({checked,onChange}) {
  return <button type="button" onClick={onChange} className={`toggle ${checked?'on':''}`}><i/></button>;
}

function SettingsPage({ quality, setQuality, fps, setFps }) {
  const [toast,setToast]=useState('');
  const [updateState,setUpdateState]=useState({status:'idle',message:'Atualizações automáticas ativadas.',version:'0.8.0',progress:-1});

  useEffect(()=>{
    const bridge=window.chrome?.webview;
    if(!bridge) return;
    const handler=e=>{
      const data=e.data || {};
      if(data.type==='updateState'){
        setUpdateState(data);
        if(data.status==='upToDate') setToast('Nenhuma atualização disponível');
        if(data.status==='error') setToast(data.message || 'Falha ao verificar atualização');
        if(data.status==='installing') setToast('Instalando atualização…');
      }
    };
    bridge.addEventListener('message',handler);
    bridge.postMessage('getUpdateState');
    return()=>bridge.removeEventListener('message',handler);
  },[]);

  const checkUpdate=()=>{
    const bridge=window.chrome?.webview;
    if(bridge) bridge.postMessage(updateState.status==='available'?'downloadUpdate':'checkUpdate');
    else setToast('Bridge nativa indisponível nesta execução');
    setTimeout(()=>setToast(''),2200);
  };

  return <main className="settings-page page-enter">
    <header className="topbar"><div><span className="eyebrow">PREFERÊNCIAS</span><h2>Configurações</h2></div><div className="version-chip">LuniraScreen Desktop <b>v{updateState.version || '0.8.0'}</b></div></header>
    <div className="settings-layout">
      <aside className="settings-nav"><button className="selected"><Sun/> Aparência</button><button><MonitorUp/> Transmissão</button><button><SlidersHorizontal/> Avançado</button><button><HelpCircle/> Sobre</button></aside>
      <section className="settings-content">
        <div className="setting-section">
          <div className="setting-heading"><div><span className="eyebrow">PERSONALIZAÇÃO</span><h3>Aparência</h3><p>Interface exclusiva do aplicativo Windows.</p></div></div>
          <div className="setting-box"><div className="setting-copy"><div className="setting-icon"><Moon size={18}/></div><div><strong>Modo escuro</strong><span>Tema principal do LuniraScreen Desktop.</span></div></div><Toggle checked={true} onChange={()=>{}}/></div>
          <div className="theme-options"><button className="theme-card selected"><div className="theme-preview dark-preview"><i/><b/><span/></div><strong>Escuro</strong><small>Ativo</small><Check size={16}/></button><button className="theme-card"><div className="theme-preview light-preview"><i/><b/><span/></div><strong>Claro</strong><small>Em breve</small></button></div>
        </div>

        <div className="setting-section">
          <div className="setting-heading"><div><span className="eyebrow">QUALIDADE</span><h3>Transmissão</h3><p>Padrões usados ao iniciar um compartilhamento.</p></div></div>
          <div className="setting-box select-box"><div className="setting-copy"><div className="setting-icon"><Film size={18}/></div><div><strong>Qualidade de vídeo</strong><span>Aplicada na próxima transmissão.</span></div></div><button className="select-choice" onClick={()=>setQuality(quality==='1080p'?'720p':'1080p')}>{quality} <ChevronDown size={16}/></button></div>
          <div className="setting-box select-box"><div className="setting-copy"><div className="setting-icon"><Gauge size={18}/></div><div><strong>Quadros por segundo</strong><span>30 FPS economiza banda; 60 FPS prioriza fluidez.</span></div></div><button className="select-choice" onClick={()=>setFps(fps===60?30:60)}>{fps} FPS <ChevronDown size={16}/></button></div>
        </div>

        <div className="setting-section update">
          <div className="setting-heading"><div><span className="eyebrow">ATUALIZAÇÕES</span><h3>{updateState.status==='available'?'Atualização disponível':'LuniraScreen Desktop'}</h3><p>{updateState.message || 'Verificação automática ativada.'}</p>{updateState.progress>=0&&<div className="update-status">{updateState.progress}%</div>}</div><button className="ghost-button" onClick={checkUpdate}>{updateState.status==='available'?'Baixar atualização':'Verificar agora'}</button></div>
        </div>
      </section>
    </div>
    {toast&&<div className="toast"><Check size={17}/> {toast}</div>}
  </main>;
}

function App() {
  const [page,setPage]=useState('home');
  const [session,setSession]=useState(null);
  const [quality,setQualityState]=useState(()=>localStorage.getItem('lunira-desktop-quality')||'1080p');
  const [fps,setFpsState]=useState(()=>localStorage.getItem('lunira-desktop-fps')==='30'?30:60);

  const setQuality=value=>{setQualityState(value);localStorage.setItem('lunira-desktop-quality',value);};
  const setFps=value=>{setFpsState(value);localStorage.setItem('lunira-desktop-fps',String(value));};

  const createRoom=name=>{
    safeSessionSet('lumacast-display-name',name);
    safeSessionRemove('lumacast-broadcaster');
    getSocket().disconnect();
    setSession({owner:true,roomId:undefined});
    setPage('room');
  };

  const joinRoom=(name,roomId)=>{
    safeSessionSet('lumacast-display-name',name);
    getSocket().disconnect();
    setSession({owner:false,roomId});
    setPage('room');
  };

  const leaveRoom=()=>{
    setSession(null);
    setPage('home');
  };

  return <div className="shell">
    <Nav page={page} setPage={setPage} hasRoom={!!session}/>
    {page==='home'
      ? <Home onCreate={createRoom} onJoin={joinRoom}/>
      : page==='room' && session
        ? <Room session={session} onLeave={leaveRoom} quality={quality} fps={fps}/>
        : <SettingsPage quality={quality} setQuality={setQuality} fps={fps} setFps={setFps}/>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
