/* Published EDVUNO editorial content, managed in the portal. */
let cmsItems=[];
let admissionOffers=[];
let admissionOffersLoaded=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?esc(u.href.replace(/['"()]/g,c=>'%'+c.charCodeAt(0).toString(16))):''}catch{return ''}};
const itemOf=t=>cmsItems.filter(x=>x.type===t);
const text=s=>esc(s).replace(/\n/g,'<br>');
const card=(x,kind='news-card')=>`<article class="${kind}">${x.imageUrl?`<div class="card-image" style="background-image:url('${safeUrl(x.imageUrl)}')"></div>`:''}<div class="card-body"><span class="kicker">EDVUNO · ${esc(x.type.toLowerCase())}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p>${x.body?`<p>${text(x.body)}</p>`:''}${x.linkUrl?`<a class="text-link" href="${safeUrl(x.linkUrl)}" target="_blank" rel="noopener noreferrer">Official details ↗</a>`:''}</div></article>`;
const section=(heading,items)=>`<section class="section cms-section"><div class="section-inner"><div class="section-head"><div><h2>${heading}</h2></div></div><div class="card-grid">${items.map(x=>card(x)).join('')}</div></div></section>`;
function applyCms(page){
  if(page==='offers'){admissionDirectory();return;}
  if(['universities','offers','scholarships','services','journal'].includes(page)){publishedDirectory(page);return;}

  const offers=[...itemOf('OFFER'),...admissionOffers.map(x=>({type:'OFFER',title:x.title,summary:x.description||'',body:[x.city,x.program].filter(Boolean).join(' · ')}))];
  if(page==='home'){
    const profiles=itemOf('UNIVERSITY');
    const intro=main.querySelector('.agency-intro');
    if(profiles.length&&intro){intro.insertAdjacentHTML('beforebegin',`<section class="section university-strip"><div class="section-inner"><h2>Explore your university options</h2><div class="university-names">${profiles.slice(0,8).map(x=>`<a href="?page=university&id=${encodeURIComponent(x.slug)}">${esc(x.title)}</a>`).join('')}</div><p>Compare ${profiles.length} published university ${profiles.length===1?'profile':'profiles'} and explore ${offers.length} current ${offers.length===1?'offer':'offers'}.</p></div></section>`);}

    if(offers.length){const anchor=main.querySelector('.agency-intro');anchor?.insertAdjacentHTML('beforebegin',section('Current offers',offers));}
    const articles=itemOf('ARTICLE');if(!articles.length)main.querySelector('.agency-journal')?.remove();
    if(articles.length){const grid=main.querySelector('.agency-journal .card-grid');if(grid)grid.innerHTML=articles.slice(0,3).map(x=>card(x)).join('');}
  }
  const names={universities:'UNIVERSITY',scholarships:'SCHOLARSHIP',services:'SERVICE',journal:'ARTICLE',faq:'FAQ'};
  const type=names[page];const records=type?itemOf(type):[];
  if(page==='universities'&&records.length){
    const grid=main.querySelector('#uni-grid');const count=main.querySelector('#result-count');
    const update=()=>{const q=(main.querySelector('#search')?.value||'').toLowerCase(),city=main.querySelector('#city-filter')?.value||'',subject=main.querySelector('#type-filter')?.value||'',level=main.querySelector('#level-filter')?.value||'',province=main.querySelector('#province-filter')?.value||'';const filtered=records.filter(x=>(x.title+' '+x.summary+' '+x.city+' '+x.subject).toLowerCase().includes(q)&&(!city||x.city===city)&&(!subject||x.subject===subject)&&(!level||x.level?.includes(level))&&(!province||x.province===province));grid.innerHTML=filtered.map(x=>`<article class="uni-card"><div class="card-body"><span class="kicker">${esc(x.city||x.province||'China')}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><div class="meta-line"><span>${esc(x.subject)}</span><span>${esc(x.level)}</span></div><a class="text-link" href="?page=university&id=${encodeURIComponent(x.slug)}" data-detail="${esc(x.slug)}">View profile →</a></div></article>`).join('')||'<p>No universities match these filters.</p>';count.textContent=`${filtered.length} ${filtered.length===1?'university':'universities'}`};
    main.querySelector('.sample-tag')?.remove();main.querySelector('.section-head p').textContent='Published university profiles from EDVUNO.';
    for(const [id,key] of [['city-filter','city'],['type-filter','subject']]){const select=main.querySelector('#'+id);select.innerHTML=`<option value="">All ${id==='city-filter'?'cities':'subjects'}</option>`+[...new Set(records.map(x=>x[key]).filter(Boolean))].map(x=>`<option>${esc(x)}</option>`).join('')}
    for(const id of ['search','city-filter','type-filter','level-filter','province-filter'])main.querySelector('#'+id)?.addEventListener('input',update);
    main.querySelector('#reset-filters')?.addEventListener('click',()=>setTimeout(update,0));update();
  } else if(page==='university'){
    const slug=new URLSearchParams(location.search).get('id');const x=records.find(y=>y.slug===slug)||itemOf('UNIVERSITY').find(y=>y.slug===slug);
    if(!x){main.innerHTML=hero('University profile unavailable','Return to the directory to explore published university information.',IMG.city2)+section('Explore universities',[]);return;}
    if(x)main.innerHTML=hero(esc(x.title),esc(x.summary),safeUrl(x.imageUrl)||IMG.city2,'EDVUNO · University profile')+`<section class="section"><div class="section-inner detail-layout"><div class="detail-main"><h2>About this university</h2><p>${text(x.body)}</p>${x.linkUrl?`<p><a class="text-link" href="${safeUrl(x.linkUrl)}" target="_blank" rel="noopener noreferrer">Visit official source ↗</a></p>`:''}</div><aside class="detail-side"><h3>At a glance</h3><div class="stat-list"><div><span>Location</span><b>${esc(x.city||x.province||'China')}</b></div><div><span>Subject</span><b>${esc(x.subject||'See details')}</b></div><div><span>Study level</span><b>${esc(x.level||'See details')}</b></div></div>${link('inquiry','Ask a question ↗','btn btn-dark')}</aside></div></section>`;
  } else if(records.length){
    const heading={scholarships:'Published scholarships',services:'Our services',journal:'Latest articles',faq:'Frequently asked questions'}[page];
    const first=main.querySelector('.section');if(first){first.outerHTML=page==='faq'?`<section class="section brand-surface brand-surface-page"><div class="section-inner"><div class="faq-list">${records.map((x,i)=>`<div class="faq-item"><button class="faq-question" type="button" aria-expanded="${i===0}"><span>${esc(x.title)}</span><span>${i===0?'−':'＋'}</span></button><div class="faq-answer" ${i?'hidden':''}>${text(x.body||x.summary)}</div></div>`).join('')}</div></div></section>`:section(heading,records);if(page==='faq')bindPage()}
  }
  const pageContent=itemOf('PAGE').find(x=>x.slug===page);
  if(pageContent){const target=main.querySelector('.page-hero-content p,.agency-title p,.form-intro p');if(target)target.textContent=pageContent.summary||pageContent.body;if(pageContent.body){const extra=`<section class="section cms-page-content"><div class="section-inner"><h2>${esc(pageContent.title)}</h2><p>${text(pageContent.body)}</p>${pageContent.linkUrl?`<a class="text-link" href="${safeUrl(pageContent.linkUrl)}" target="_blank" rel="noopener noreferrer">More information ↗</a>`:''}</div></section>`;main.querySelector('.page-hero,.agency-hero')?.insertAdjacentHTML('afterend',extra);if(page==='contact')main.querySelector('.contact-grid .contact-card:last-child')?.remove();}}
}
window.applyCms=applyCms;
fetch('/api/public/site-content',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Content unavailable');return r.json()}).then(data=>{cmsItems=Array.isArray(data.items)?data.items:[];admissionOffers=Array.isArray(data.admissionOffers)?data.admissionOffers:[];admissionOffersLoaded=true;render()}).catch(()=>{const message=main.querySelector('[role=status]');if(message)message.textContent='Information is temporarily unavailable. Please refresh to try again.';});

function publishedDirectory(page){
 const isUni=page==='universities', contentTypes={universities:'UNIVERSITY',offers:'OFFER',scholarships:'SCHOLARSHIP',services:'SERVICE',journal:'ARTICLE'}, titles={universities:'Universities',offers:'Available offers',scholarships:'Scholarships',services:'Guidance & services',journal:'Journal'}, records=itemOf(contentTypes[page]), title=titles[page];
 main.innerHTML=hero(title,isUni?'Explore university information published by EDVUNO.':'Explore information and opportunities published by EDVUNO.',IMG.city2,'EDVUNO · '+title)+`<section class="section"><div class="section-inner"><div class="section-head"><h2>${title}</h2></div><div class="filter-shell"><input id="published-search" type="search" placeholder="Search ${title.toLowerCase()}" aria-label="Search ${title.toLowerCase()}">${['province','city','subject','level'].map(k=>`<select id="published-${k}" aria-label="Filter by ${k==='subject'&&page==='scholarships'?'funding type':k}"><option value="">All ${k==='subject'&&page==='scholarships'?'funding types':k==='province'?'provinces / regions':k==='city'?'cities':k==='subject'?'subjects':'levels'}</option>${[...new Set(records.map(x=>x[k]).filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`).join('')}<button id="published-reset" type="button">Reset</button></div><p id="published-count" role="status" aria-live="polite"></p><div class="card-grid" id="published-grid"></div></div></section>`;
 const fields=['search','province','city','subject','level'],params=new URLSearchParams(location.search);
 for(const k of fields){const el=main.querySelector('#published-'+k);if(params.get(k))el.value=params.get(k);if(k==='subject'&&params.get('funding'))el.value=params.get('funding');}
 const update=()=>{const values=Object.fromEntries(fields.map(k=>[k,main.querySelector('#published-'+k).value]));const matches=records.filter(x=>(x.title+' '+x.summary+' '+x.body+' '+(x.city||'')+' '+(x.province||'')+' '+(x.subject||'')).toLowerCase().includes(values.search.toLowerCase())&&fields.slice(1).every(k=>!values[k]||x[k]===values[k]));main.querySelector('#published-count').textContent=matches.length+' '+title.toLowerCase()+' found';main.querySelector('#published-grid').innerHTML=matches.map(x=>isUni?`<article class="uni-card">${x.imageUrl?`<div class="card-image" style="background-image:url('${safeUrl(x.imageUrl)}')"></div>`:''}<div class="card-body"><span class="kicker">${esc([x.province,x.city].filter(Boolean).join(' · '))}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><div class="meta-line"><span>${esc(x.subject)}</span><span>${esc(x.level)}</span></div><a class="text-link" href="?page=university&id=${encodeURIComponent(x.slug)}">View university →</a></div></article>`:card(x)).join('')||`<p>${records.length?'No results match your search. Try resetting the filters.':'No '+(page==='offers'?'offers':title.toLowerCase())+' have been published yet. Please check back soon.'}</p>`;};
 fields.forEach(k=>main.querySelector('#published-'+k).addEventListener('input',update));main.querySelector('#published-reset').addEventListener('click',()=>{fields.forEach(k=>main.querySelector('#published-'+k).value='');update()});update();
}
pages.offers=()=>hero('Available offers','Explore opportunities published by EDVUNO.',IMG.city2);


function admissionDirectory(){
 const records=admissionOffers;
 const has=key=>records.some(x=>Object.prototype.hasOwnProperty.call(x,key));
 const choices=key=>[...new Set(records.map(x=>x[key]).filter(Boolean))].sort();
 const periodLabel=v=>({SEMESTER:'Per semester',YEAR:'Per year',MONTH:'Per month'}[v]||v);
 const select=(id,label,values)=>`<select id="${id}" aria-label="${label}"><option value="">All ${label.toLowerCase()}</option>${values.map(v=>`<option value="${esc(v)}">${esc(periodLabel(v))}</option>`).join('')}</select>`;
 const filterParts=[`<input id="offer-search" type="search" placeholder="Search public offer details" aria-label="Search public offer details">`];
 if(has('city'))filterParts.push(select('offer-city','Cities',choices('city')));
 if(has('program'))filterParts.push(select('offer-program','Programs',choices('program')));
 if(has('minAge')||has('maxAge'))filterParts.push(`<input id="offer-age" type="number" min="0" inputmode="numeric" placeholder="Your age" aria-label="Filter by age">`);
 if(has('tuitionMin')||has('tuitionMax'))filterParts.push(`<div class="offer-budget"><input id="offer-tuition" type="number" min="0" inputmode="decimal" placeholder="Max tuition · RMB" aria-label="Maximum tuition in RMB">${select('offer-tuition-period','Tuition period',['SEMESTER','YEAR'])}</div>`);
 if(has('hostelMin')||has('hostelMax'))filterParts.push(`<div class="offer-budget"><input id="offer-hostel" type="number" min="0" inputmode="decimal" placeholder="Max hostel · RMB" aria-label="Maximum hostel cost in RMB">${select('offer-hostel-period','Hostel period',['MONTH','SEMESTER','YEAR'])}</div>`);
 if(has('stipendMin')||has('stipendMax'))filterParts.push(`<input id="offer-stipend" type="number" min="0" inputmode="decimal" placeholder="Min monthly stipend · RMB" aria-label="Minimum monthly stipend in RMB">`);
 main.innerHTML=hero('University offers','Compare published admission opportunities by city, program, eligibility, and cost.',IMG.city2,'EDVUNO · Admission offers')+`<section class="section"><div class="section-inner"><div class="section-head"><div><div class="kicker">Find your fit</div><h2>Published admission offers</h2></div><p>All fees are shown in RMB with their billing period.</p></div><div class="filter-shell offer-filter-shell">${filterParts.join('')}<button id="offer-reset" type="button">Reset</button></div><p id="offer-count" role="status" aria-live="polite"></p><div class="offer-grid" id="offer-grid"></div><div id="legacy-offers"></div></div></section>`;
 const ids=['offer-search','offer-city','offer-program','offer-age','offer-tuition','offer-tuition-period','offer-hostel','offer-hostel-period','offer-stipend'];
 const get=id=>main.querySelector('#'+id)?.value||'';
 const visibleAmount=(x,minKey,maxKey)=>x[minKey]!==undefined||x[maxKey]!==undefined;
 const min=x=>x===null||x===undefined?'':Number(x);
 const matches=x=>{
  const query=get('offer-search').trim().toLowerCase();
  if(query&&!(String(x.title||'')+' '+String(x.description||'')+' '+String(x.city||'')+' '+String(x.program||'')+' '+String(x.intake||'')).toLowerCase().includes(query))return false;
  if(get('offer-city')&&x.city!==get('offer-city'))return false;
  if(get('offer-program')&&x.program!==get('offer-program'))return false;
  const age=get('offer-age');
  if(age){if(x.minAge===undefined&&x.maxAge===undefined)return false;const n=Number(age);if(x.minAge!==undefined&&x.minAge!==null&&n<Number(x.minAge))return false;if(x.maxAge!==undefined&&x.maxAge!==null&&n>Number(x.maxAge))return false;}
  const tuition=get('offer-tuition'),tuitionPeriod=get('offer-tuition-period');
  if(tuition||tuitionPeriod){if(!visibleAmount(x,'tuitionMin','tuitionMax'))return false;if(tuitionPeriod&&x.tuitionPeriod!==tuitionPeriod)return false;if(tuition&&min(x.tuitionMin)!==''&&Number(x.tuitionMin)>Number(tuition))return false;if(tuition&&min(x.tuitionMax)===''&&min(x.tuitionMin)==='')return false;}
  const hostel=get('offer-hostel'),hostelPeriod=get('offer-hostel-period');
  if(hostel||hostelPeriod){if(!visibleAmount(x,'hostelMin','hostelMax'))return false;if(hostelPeriod&&x.hostelPeriod!==hostelPeriod)return false;if(hostel&&min(x.hostelMin)!==''&&Number(x.hostelMin)>Number(hostel))return false;if(hostel&&min(x.hostelMax)===''&&min(x.hostelMin)==='')return false;}
  const stipend=get('offer-stipend');
  if(stipend){if(!visibleAmount(x,'stipendMin','stipendMax'))return false;if(min(x.stipendMax)!==''&&Number(x.stipendMax)<Number(stipend))return false;if(min(x.stipendMin)===''&&min(x.stipendMax)==='')return false;}
  return true;
 };
 const fee=(x,minKey,maxKey,periodKey,label)=>{if(!visibleAmount(x,minKey,maxKey))return '';const lo=x[minKey],hi=x[maxKey],range=lo!=null&&hi!=null?`${Number(lo).toLocaleString()}–${Number(hi).toLocaleString()}`:lo!=null?`${Number(lo).toLocaleString()}+`:hi!=null?`Up to ${Number(hi).toLocaleString()}`:'';return range?`<div class="offer-stat"><span>${label}</span><strong>¥${range}</strong><small>per ${esc(String(x[periodKey]||'month').toLowerCase())}</small></div>`:''};
 const update=()=>{
  const found=records.filter(matches),grid=main.querySelector('#offer-grid');
  main.querySelector('#offer-count').textContent=admissionOffersLoaded?`${found.length} ${found.length===1?'offer':'offers'} found`:'';
  if(!admissionOffersLoaded)grid.innerHTML='<div class="offer-empty">Loading university offers…</div>';
  else if(!found.length)grid.innerHTML=`<div class="offer-empty">${records.length?'No offers match these filters. Change or reset your filters.':'No admission offers have been published yet. Please check back soon.'}</div>`;
  else grid.innerHTML=found.map(x=>`<article class="admission-card"><div class="admission-card-head"><span class="kicker">${esc(x.city||'Admission opportunity')}</span>${x.intake?`<span class="offer-intake">${esc(x.intake)}</span>`:''}</div><h3>${esc(x.title||'University offer')}</h3>${x.description?`<p>${text(x.description)}</p>`:''}${x.universityName?`<p class="offer-identity">University: ${esc(x.universityName)}</p>`:''}${x.exactLocation?`<p class="offer-identity">Location: ${esc(x.exactLocation)}</p>`:''}${x.program?`<p class="offer-program">${esc(x.program)}</p>`:''}${(x.minAge!=null||x.maxAge!=null)?`<p class="offer-age">Eligible age: ${x.minAge??'Any'}–${x.maxAge??'Any'}</p>`:''}<div class="offer-stats">${fee(x,'tuitionMin','tuitionMax','tuitionPeriod','Tuition')}${fee(x,'hostelMin','hostelMax','hostelPeriod','Hostel')}${fee(x,'stipendMin','stipendMax','stipendPeriod','Stipend')}</div></article>`).join('');
  const editorial=itemOf('OFFER');main.querySelector('#legacy-offers').innerHTML=editorial.length?`<div class="legacy-offers"><h2>More from EDVUNO</h2><div class="card-grid">${editorial.map(x=>card(x)).join('')}</div></div>`:'';
 };
 ids.forEach(id=>main.querySelector('#'+id)?.addEventListener('input',update));
 main.querySelector('#offer-reset').addEventListener('click',()=>{ids.forEach(id=>{const el=main.querySelector('#'+id);if(el)el.value=''});update()});
 update();
}

function publishedDirectory(page){
 const isUni=page==='universities', records=itemOf(isUni?'UNIVERSITY':'OFFER'), title=isUni?'Universities':'Available offers';
 main.innerHTML=hero(title,isUni?'Explore university information published by EDVUNO.':'Browse current opportunities published by EDVUNO.',IMG.city2,'EDVUNO · '+title)+`<section class="section"><div class="section-inner"><div class="section-head"><h2>${title}</h2></div><div class="filter-shell"><input id="published-search" type="search" placeholder="Search ${title.toLowerCase()}" aria-label="Search ${title.toLowerCase()}">${['province','city','subject','level'].map(k=>`<select id="published-${k}" aria-label="Filter by ${k==='subject'&&page==='scholarships'?'funding type':k}"><option value="">All ${k==='province'?'provinces / regions':k==='city'?'cities':k==='subject'?'subjects':'levels'}</option>${[...new Set(records.map(x=>x[k]).filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`).join('')}<button id="published-reset" type="button">Reset</button></div><p id="published-count" role="status" aria-live="polite"></p><div class="card-grid" id="published-grid"></div></div></section>`;
 const fields=['search','province','city','subject','level'],params=new URLSearchParams(location.search);
 for(const k of fields){const el=main.querySelector('#published-'+k);if(params.get(k))el.value=params.get(k);}
 const update=()=>{const values=Object.fromEntries(fields.map(k=>[k,main.querySelector('#published-'+k).value]));const matches=records.filter(x=>(x.title+' '+x.summary+' '+x.body+' '+(x.city||'')+' '+(x.province||'')+' '+(x.subject||'')).toLowerCase().includes(values.search.toLowerCase())&&fields.slice(1).every(k=>!values[k]||x[k]===values[k]));main.querySelector('#published-count').textContent=matches.length+' '+(isUni?'universities':'offers')+' found';main.querySelector('#published-grid').innerHTML=matches.map(x=>isUni?`<article class="uni-card">${x.imageUrl?`<div class="card-image" style="background-image:url('${safeUrl(x.imageUrl)}')"></div>`:''}<div class="card-body"><span class="kicker">${esc([x.province,x.city].filter(Boolean).join(' · '))}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><div class="meta-line"><span>${esc(x.subject)}</span><span>${esc(x.level)}</span></div><a class="text-link" href="?page=university&id=${encodeURIComponent(x.slug)}">View university →</a></div></article>`:card(x)).join('')||`<p>${records.length?'No results match your search. Try resetting the filters.':'No '+(isUni?'universities':'offers')+' have been published yet. Please check back soon.'}</p>`;};
 fields.forEach(k=>main.querySelector('#published-'+k).addEventListener('input',update));main.querySelector('#published-reset').addEventListener('click',()=>{fields.forEach(k=>main.querySelector('#published-'+k).value='');update()});update();
}
pages.offers=()=>hero('Available offers','Explore opportunities published by EDVUNO.',IMG.city2);

