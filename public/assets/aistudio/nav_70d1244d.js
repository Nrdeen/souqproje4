(function(){
  var dds=[].slice.call(document.querySelectorAll('.dd')).map(function(d){return {b:d.querySelector('.dd-b'),m:d.querySelector('.dd-m')}}).filter(function(d){return d.b&&d.m});
  if(!dds.length)return;
  var y0=0;
  function place(d){var r=d.b.getBoundingClientRect(),w=d.m.offsetWidth,vw=document.documentElement.clientWidth;
    var right=Math.min(Math.max(r.right,w+8),vw-8);d.m.style.top=(r.bottom+6)+'px';d.m.style.left=(right-w)+'px'}
  function set(d,o){d.b.setAttribute('aria-expanded',o);d.m.hidden=!o;if(o){y0=window.scrollY;place(d)}}
  function closeAll(except){dds.forEach(function(d){if(d!==except&&!d.m.hidden)set(d,false)})}
  dds.forEach(function(d){
    d.b.addEventListener('click',function(e){e.stopPropagation();closeAll(d);set(d,d.m.hidden)});
  });
  document.addEventListener('click',function(e){dds.forEach(function(d){if(!d.m.hidden&&!d.m.contains(e.target))set(d,false)})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){dds.forEach(function(d){if(!d.m.hidden){set(d,false);d.b.focus()}})}});
  window.addEventListener('resize',function(){dds.forEach(function(d){if(!d.m.hidden)place(d)})});
  window.addEventListener('scroll',function(){if(Math.abs(window.scrollY-y0)>10)closeAll()},{passive:true});
})();

(function(){
  var w=document.createElement('a');w.className='bot-add';w.href='ads.html';w.setAttribute('aria-label','أضف إعلانك مجاناً');
  w.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>أضف إعلان';
  document.body.appendChild(w);
})();
