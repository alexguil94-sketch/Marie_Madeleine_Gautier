(async function(){
  const grid = document.getElementById('booksGrid');
  if(!grid) return;

  const res = await fetch('data/books.json');
  const books = await res.json();

  grid.innerHTML = books.map(b=>`
    <div class="work" style="cursor:default">
      <img src="${b.cover}" alt="">
      <div class="meta">
        <div style="font-weight:600">${b.title}</div>
        <div class="muted">${b.year || ''}</div>
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
          <a class="btn ghost" href="${b.pdf}" target="_blank" rel="noreferrer">${window.__t?.('books.open') ?? 'Ouvrir PDF'}</a>
          <a class="btn" href="${b.pdf}" download>${window.__t?.('books.download') ?? 'Télécharger'}</a>
        </div>
      </div>
    </div>
  `).join('');
})();
