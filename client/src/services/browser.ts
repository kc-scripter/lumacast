const sessionFallback=new Map<string,string>();

export function safeSessionGet(key:string){
  try{
    const value=sessionStorage.getItem(key);
    if(value!==null){sessionFallback.set(key,value);return value;}
  }catch{}
  return sessionFallback.get(key)??null;
}

export function safeSessionSet(key:string,value:string){
  sessionFallback.set(key,value);
  try{sessionStorage.setItem(key,value);return true;}catch{return false;}
}

export function safeSessionRemove(key:string){
  sessionFallback.delete(key);
  try{sessionStorage.removeItem(key);}catch{}
}

export async function copyText(value:string){
  if(navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(value);return;}catch{}
  }
  const input=document.createElement("textarea");
  input.value=value;input.setAttribute("readonly","");input.style.position="fixed";input.style.opacity="0";
  document.body.append(input);input.select();
  const copied=document.execCommand("copy");input.remove();
  if(!copied)throw new Error("Copy failed");
}
