(function(){
  const form = document.getElementById('contactForm');
  if(!form) return;
  const note = document.getElementById('contactNote');

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    obj.date = new Date().toISOString();

    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contact-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    if(note) note.textContent = window.__t?.('contact.sent') ?? 'Message exporté.';
    form.reset();
  });
})();
