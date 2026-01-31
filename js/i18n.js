const I18N = {
  lang: localStorage.getItem('lang') || 'fr',
  dict: {},
};

async function loadLang(lang){
  const res = await fetch(`i18n/${lang}.json`);
  I18N.dict = await res.json();
  I18N.lang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
  updateLangLabel();
  updateLangButtons();
  window.dispatchEvent(new Event('i18n:changed'));
  // close lang menu if it's open
  document.querySelector('[data-lang-wrap]')?.classList.remove('is-open');
  document.querySelector('[data-lang-toggle]')?.setAttribute('aria-expanded', 'false');
}

function t(key){
  return key.split('.').reduce((o,k)=> (o && o[k] != null) ? o[k] : null, I18N.dict) ?? key;
}

function applyTranslations(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.documentElement.lang = I18N.lang.startsWith('zh') ? 'zh-Hant' : I18N.lang;
}

function updateLangLabel(){
  const lab = document.querySelector('[data-lang-label]');
  if(lab){
    if(I18N.lang === 'zh-Hant') lab.textContent = '中文';
    else lab.textContent = I18N.lang.toUpperCase();
  }
}

function updateLangButtons(){
  document.querySelectorAll('[data-lang]')?.forEach(btn=>{
    const isActive = btn.dataset.lang === I18N.lang;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-lang]');
  if(btn){
    loadLang(btn.dataset.lang);
  }
});

document.addEventListener('partials:loaded', ()=>{
  applyTranslations();
  updateLangLabel();
  updateLangButtons();
});

window.addEventListener('DOMContentLoaded', ()=> loadLang(I18N.lang));

window.__t = t;
window.__lang = ()=> I18N.lang;
