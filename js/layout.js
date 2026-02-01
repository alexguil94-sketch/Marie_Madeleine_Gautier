async function injectPartial(targetId, url){
  const el = document.getElementById(targetId);
  if(!el) return;
  const res = await fetch(url);
  el.innerHTML = await res.text();
}

(async function(){
  await injectPartial("siteHeader", "partials/header.html");
  await injectPartial("siteFooter", "partials/footer.html");

  const y = document.querySelector("[data-year]");
  if(y) y.textContent = new Date().getFullYear();

  document.dispatchEvent(new CustomEvent('partials:loaded'));
})();
