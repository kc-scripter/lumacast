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
    "Câmaras":"Câmeras",
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
    "As câmaras dos participantes aparecem aqui quando estão ligadas.":"As câmeras e participantes da sala aparecem aqui."
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
        raise RuntimeError("Legacy signaling endpoint survived frontend build")\n    for expected in ["Timeout ao conectar no Agora","Timeout ao publicar no Agora","Timeout ao conectar no LiveKit","Timeout ao publicar tela no LiveKit"]:\n        if expected not in js:\n            raise RuntimeError(f"RTC hardening patch missing: {expected}")
    print("Prepared polished Lunira Screen frontend in",DIST)

if __name__=="__main__":
    main()
