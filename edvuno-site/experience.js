/* Navigation behavior shared by every public page. */
const drawer = document.querySelector('#mobile-menu');
const drawerToggle = document.querySelector('.menu-toggle');
const backdrop = document.createElement('button');
backdrop.className = 'drawer-backdrop';
backdrop.hidden = true;
backdrop.setAttribute('aria-label', 'Close navigation');
document.querySelector('#site-header').append(backdrop);
function syncDrawer() {
  const open = !drawer.hidden && matchMedia('(max-width: 77.999rem)').matches;
  document.body.classList.toggle('drawer-open', open);
  backdrop.hidden = !open;
  drawerToggle.querySelector('.sr-only').textContent = open ? 'Close menu' : 'Open menu';
}
function closeDrawer() {
  drawer.hidden = true;
  drawerToggle.setAttribute('aria-expanded', 'false');
  syncDrawer();
}
new MutationObserver(syncDrawer).observe(drawer, { attributes:true, attributeFilter:['hidden'] });
backdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', event => {
  if (drawer.hidden) return;
  if (event.key === 'Escape') { closeDrawer(); drawerToggle.focus(); }
  if (event.key === 'Tab') {
    const links = [...drawer.querySelectorAll('a')];
    const first = drawerToggle, last = links.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
addEventListener('resize', () => { if (matchMedia('(min-width:78rem)').matches) closeDrawer(); });
new MutationObserver(() => {
  main.querySelectorAll('img:not([loading])').forEach(img => {
    if (img.closest('.agency-hero,.page-hero')) { img.loading = 'eager'; img.fetchPriority = 'high'; }
    else img.loading = 'lazy';
    img.decoding = 'async';
  });
}).observe(main, { childList:true, subtree:true });
syncDrawer();

// Capture inquiry review before the original page handler replaces the form.
document.addEventListener('submit', event => {
  if (event.target.id !== 'inquiry-form') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const form = event.target;
  const labels = { first:'First name', last:'Last name', email:'Email', level:'Study level', subject:'Subject', message:'Questions' };
  const lines = Object.entries(labels).map(([id,label]) => label + ': ' + form.querySelector('#'+id).value);
  const summary = document.createElement('pre'); summary.textContent = lines.join('\n'); summary.style.whiteSpace = 'pre-wrap';
  const heading = document.createElement('h2'); heading.textContent = 'Your study inquiry';
  const download = document.createElement('button'); download.type = 'button'; download.className = 'btn btn-dark'; download.textContent = 'Download inquiry';
  download.onclick = () => { const url = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'})); const a = document.createElement('a'); a.href=url; a.download='EDVUNO-study-inquiry.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const back = document.createElement('button'); back.type='button'; back.className='text-link'; back.textContent='Edit inquiry';
  const fields = [...form.children]; fields.forEach(el=>el.hidden=true);
  back.onclick=()=>{heading.remove();summary.remove();download.remove();back.remove();fields.forEach(el=>el.hidden=false)};
  form.append(heading,summary,download,back); heading.tabIndex=-1; heading.focus();
}, true);
