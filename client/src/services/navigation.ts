export function navigate(path:string){
  const current=`${location.pathname}${location.search}${location.hash}`;
  if(current===path)return;
  history.pushState(null,"",path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({top:0,left:0,behavior:"auto"});
}
