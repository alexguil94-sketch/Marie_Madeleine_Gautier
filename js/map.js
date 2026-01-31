(async function(){
  const el = document.getElementById('worldMap');
  if(!el || typeof L === 'undefined') return;

  const map = L.map('worldMap', {zoomControl:true, worldCopyJump:true}).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const pane = map.createPane('tint');
  pane.style.zIndex = 200;
  L.rectangle([[-90,-180],[90,180]], {pane:'tint', color:'#000', weight:0, fillOpacity:0.18}).addTo(map);

  const res = await fetch('data/locations.json');
  const points = await res.json();

  points.forEach(p=>{
    const title = p.title || 'Exposition';
    const city = p.city || '';
    const popup = `
      <div style="min-width:220px">
        <div style="color:#c5a059; font-weight:600">${title}</div>
        <div style="opacity:.85">${city}</div>
        <div style="opacity:.7; margin-top:6px">${p.date || ''}</div>
      </div>`;
    L.marker([p.lat, p.lng]).addTo(map).bindPopup(popup);
  });
})();
