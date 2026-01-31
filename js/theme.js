(function(){
  const KEY = "theme";

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
    const btn = document.querySelector("[data-theme-toggle]");
    const icon = btn?.querySelector('.icon');
    if(icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
  }

  function getTheme(){
    return localStorage.getItem(KEY) || 'dark';
  }

  function toggle(){
    applyTheme(getTheme()==='dark' ? 'light' : 'dark');
  }

  // init early (but safe)
  applyTheme(getTheme());

  document.addEventListener('click', (e)=>{
    if(e.target.closest('[data-theme-toggle]')) toggle();
  });

  document.addEventListener('partials:loaded', ()=> applyTheme(getTheme()));
})();
