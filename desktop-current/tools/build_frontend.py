#!/usr/bin/env python3
from __future__ import annotations
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"recovered-v0.3.0"/"frontend"
DIST=ROOT/"dist"
JS_NAME="index-Dm-7PBzL.js"

TEXT_REPLACEMENTS={
    "Partilha de ecrã em HD e baixa latência.":"Compartilhamento de tela em HD e baixa latência.",
    "Uma forma simples de mostrar o que importa, em tempo real.":"Uma forma simples de mostrar o que importa em tempo real.",
    "O seu espaço para criar e partilhar.":"Seu espaço para criar e compartilhar.",
    "Como te ":"Como você ",
    "chamas?":"quer ser chamado?",
    "O teu nome será apresentado aos participantes das salas onde estiveres.":"Seu nome será exibido para os participantes das salas em que você entrar.",
    "O TEU NOME":"SEU NOME",
    "Escreve o teu nome":"Digite seu nome",
    "O que pretende ":"O que você quer ",
    "Partilhe o seu ecrã ou entre numa sala em segundos.":"Compartilhe sua tela ou entre em uma sala em segundos.",
    "O SEU NOME":"SEU NOME",
    "Como devemos chamar-lhe?":"Como devemos chamar você?",
    "Transmitir Ecrã":"Compartilhar Tela",
    "Já recebeu um convite? Introduza o código para aceder à sala.":"Já recebeu um convite? Digite o código para entrar na sala.",
    "Definições":"Configurações",
    "Câmara":"Câmera",
    "Câmaras":"Participantes",
    "Dispositivo predefinido":"Dispositivo padrão",
    "Nenhum dispositivo detetado":"Nenhum dispositivo detectado",
    "Ecrã principal":"Tela principal",
    "Ecrã partilhado":"Tela compartilhada",
    "Partilhar ecrã":"Compartilhar tela",
    "Áudio do ecrã":"Áudio da tela",
    "A assistir à transmissão":"Assistindo à transmissão",
    "A ligar à sala":"Conectando à sala",
    "A ligar…":"Conectando…",
    "Ligado ao servidor":"Conectado ao servidor",
    "Partilha interrompida":"Compartilhamento interrompido",
    "As câmaras dos participantes aparecem aqui quando estão ligadas.":"Participantes da sala aparecem aqui."
}

PARTICIPANT_OLD='const _e=w.cameras.map(Ae=>({id:Ae.identity,name:Ae.local?c:ee.find($e=>$e.id===Ae.identity)?.displayName||"Participante",track:Ae.track,local:Ae.local}));return _e.some(Ae=>Ae.local)||_e.unshift({id:"self",name:c,local:!0})'

AGORA_JOIN_OLD='await et.setClientRole("host"),await et.join(Ke.agoraAppId,Ke.agoraChannel,Ke.agoraToken,Ke.agoraUid);'
AGORA_JOIN_NEW='await et.setClientRole("host"),await Promise.race([et.join(Ke.agoraAppId,Ke.agoraChannel,Ke.agoraToken,Ke.agoraUid),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Timeout ao conectar no Agora")),12000))]);'
AGORA_PUBLISH_OLD='b.current=Di,await et.publish(Di),await ro(hr,vt,an,Un)'
AGORA_PUBLISH_NEW='b.current=Di,await Promise.race([et.publish(Di),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Timeout ao publicar no Agora")),12000))]),await ro(hr,vt,an,Un)'
LIVEKIT_CONNECT_OLD='try{if(await Yt.connect(et.livekitUrl,et.livekitToken),A.current=Yt'
LIVEKIT_CONNECT_NEW='try{if(await Promise.race([Yt.connect(et.livekitUrl,et.livekitToken),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Timeout ao conectar no LiveKit")),12000))]),A.current=Yt'
LIVEKIT_SCREEN_PUBLISH_OLD='if(await vt.localParticipant.publishTrack(an,{source:Ge.Source.ScreenShare}),u.current!==Ke)'
LIVEKIT_SCREEN_PUBLISH_NEW='if(await Promise.race([vt.localParticipant.publishTrack(an,{source:Ge.Source.ScreenShare}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Timeout ao publicar tela no LiveKit")),12000))]),u.current!==Ke)'

QUALITY_OPTION_4K='te.jsx("option",{value:"4K",children:"4K · Ultra HD"})'
PREFERENCES_OLD='function oOe(){try{return{...G1,...JSON.parse(lj("lunira_preferences")||"{}")}}catch{return G1}}'
PREFERENCES_NEW='function oOe(){try{const p={...G1,...JSON.parse(lj("lunira_preferences")||"{}")};return p.resolution==="4K"&&(p.resolution="1080p"),p}catch{return G1}}'
QUALITY_MAP_OLD='j=b.resolution==="4K"?"auto":b.resolution'
QUALITY_MAP_NEW='j=b.resolution==="4K"?"1080p":b.resolution'

SOCKET_CLIENT_OLD='bP=TP("https://lunira-screen.onrender.com",{autoConnect:!1,reconnection:!0,reconnectionAttempts:1/0,reconnectionDelay:800,reconnectionDelayMax:5e3,randomizationFactor:.3,timeout:8e3})'
SOCKET_CLIENT_NEW='bP=TP("https://lunira-screen.onrender.com",{autoConnect:!1,reconnection:!0,reconnectionAttempts:1/0,reconnectionDelay:600,reconnectionDelayMax:3e3,randomizationFactor:.25,timeout:25e3,transports:["polling","websocket"]})'
SOCKET_ERROR_OLD='si=()=>{Kr("Sem ligação"),le("Servidor de salas indisponível. Verifique a ligação e o endereço do servidor.")}'
SOCKET_ERROR_NEW='si=()=>{Kr("Reconectando"),le("Reconectando ao servidor. Se ele estiver iniciando, isso pode levar alguns segundos.")}'

PARTICIPANT_NEW='const _e=w.cameras.map(Ae=>({id:Ae.identity,name:Ae.local?c:ee.find($e=>$e.id===Ae.identity)?.displayName||"Participante",track:Ae.track,local:Ae.local}));ee.forEach(Ae=>{_e.some($e=>$e.id===Ae.id)||_e.push({id:Ae.id,name:Ae.displayName||"Participante",local:Ae.displayName===c})});return _e.some(Ae=>Ae.local)||_e.unshift({id:"self",name:c,local:!0})'

def replace_exact(text:str,old:str,new:str)->str:
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f"Expected exactly one occurrence of {old[:80]!r}, found {count}")
    return text.replace(old,new)

def main():
    if not SOURCE.exists():
        raise SystemExit(f"Recovered frontend missing: {SOURCE}")
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SOURCE,DIST)

    js_path=DIST/"assets"/JS_NAME
    js=js_path.read_text("utf-8")
    js=js.replace("https://lunirascreen.onrender.com","https://lunira-screen.onrender.com")
    js=replace_exact(js,PARTICIPANT_OLD,PARTICIPANT_NEW)
    js=replace_exact(js,"children:w.cameras.length","children:_e.length")
    js=replace_exact(js,AGORA_JOIN_OLD,AGORA_JOIN_NEW)
    js=replace_exact(js,AGORA_PUBLISH_OLD,AGORA_PUBLISH_NEW)
    js=replace_exact(js,LIVEKIT_CONNECT_OLD,LIVEKIT_CONNECT_NEW)
    js=replace_exact(js,LIVEKIT_SCREEN_PUBLISH_OLD,LIVEKIT_SCREEN_PUBLISH_NEW)
    js=replace_exact(js,QUALITY_OPTION_4K,"")
    js=replace_exact(js,PREFERENCES_OLD,PREFERENCES_NEW)
    js=replace_exact(js,QUALITY_MAP_OLD,QUALITY_MAP_NEW)
    js=replace_exact(js,SOCKET_CLIENT_OLD,SOCKET_CLIENT_NEW)
    js=replace_exact(js,SOCKET_ERROR_OLD,SOCKET_ERROR_NEW)
    js=js.replace("Até 4K · 60 FPS · baixa latência","Até 1080p · 60 FPS · baixa latência")
    for old,new in TEXT_REPLACEMENTS.items():
        js=js.replace(old,new)
    js_path.write_text(js,"utf-8")

    shutil.copy2(ROOT/"polish.css",DIST/"polish.css")
    shutil.copy2(ROOT/"polish.js",DIST/"polish.js")
    html_path=DIST/"index.html"
    html=html_path.read_text("utf-8").replace('lang="pt-PT"','lang="pt-BR"')
    if "polish.css" not in html:
        html=html.replace("</head>",'    <link rel="stylesheet" href="./polish.css">\n  </head>')
    if "polish.js" not in html:
        html=html.replace("</body>",'    <script type="module" src="./polish.js"></script>\n  </body>')
    html_path.write_text(html,"utf-8")

    if "https://lunirascreen.onrender.com" in js:
        raise RuntimeError("Legacy signaling endpoint survived frontend build")
    if 'value:"4K"' in js or "Até 4K · 60 FPS · baixa latência" in js:
        raise RuntimeError("4K option survived frontend build")
    if "timeout:25e3" not in js or 'transports:["polling","websocket"]' not in js:
        raise RuntimeError("Desktop signaling resilience patch missing")
    for expected in ["Timeout ao conectar no Agora","Timeout ao publicar no Agora","Timeout ao conectar no LiveKit","Timeout ao publicar tela no LiveKit"]:
        if expected not in js:
            raise RuntimeError(f"RTC hardening patch missing: {expected}")
    print("Prepared polished Lunira Screen frontend in",DIST)

if __name__=="__main__":
    main()
