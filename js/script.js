const menu=document.querySelector('.menu');const nav=document.querySelector('#navlinks');menu?.addEventListener('click',()=>nav.classList.toggle('open'));document.querySelectorAll('#navlinks a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

// Carrega automaticamente as fotografias geridas pelo painel administrativo.
(async function(){
  try{
    const r=await fetch('/.netlify/functions/admin-api?action=list');
    if(!r.ok)return;
    const d=await r.json();
    const gallery=document.querySelector('#siteGallery');
    if(gallery && d.images?.length){
      gallery.innerHTML=d.images.map((im,i)=>`<img loading="lazy" src="${im.url}" alt="Flerte Nature - fotografia ${i+1}">`).join('');
      const bg=d.background ? `/.netlify/functions/admin-api?action=image&name=${encodeURIComponent(d.background)}` : d.images[0]?.url;
      if(bg) document.querySelector('.hero-bg').style.backgroundImage=`linear-gradient(rgba(245,250,251,.78),rgba(245,250,251,.88)),url("${bg}")`;
      if(bg) document.querySelector('.hero-bg').style.backgroundSize='cover';
    }
  }catch(e){console.log('Galeria dinâmica indisponível:',e)}
})();
