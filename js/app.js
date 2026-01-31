(function(){
  const io = new IntersectionObserver((entries)=>{
    for(const ent of entries){
      if(ent.isIntersecting){
        ent.target.classList.add('is-visible');
        io.unobserve(ent.target);
      }
    }
  }, {threshold:0.12});

  window.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  });
})();

// Trigger page-load animations (e.g., hero drop)
window.addEventListener('load', ()=>{
  document.body.classList.add('is-loaded');
});
