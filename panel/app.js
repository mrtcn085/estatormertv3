let cfg = {};
let badConfig = true;
let sb = null;

function readStoredConfig(){
  try { return JSON.parse(localStorage.getItem('emlak_crm_supabase_config') || '{}'); } catch { return {}; }
}
function configIsBad(c){
  return !c || !c.SUPABASE_URL || String(c.SUPABASE_URL).includes('BURAYA_') ||
    !c.SUPABASE_KEY || String(c.SUPABASE_KEY).includes('BURAYA_') ||
    !String(c.SUPABASE_URL).startsWith('https://') || !String(c.SUPABASE_URL).includes('.supabase.co');
}
function getEffectiveConfig(){
  const stored = readStoredConfig();
  if(!configIsBad(stored)) return stored;
  return window.EMLAK_CRM_CONFIG || {};
}
function updateConfigUi(){
  const warn = document.getElementById('configWarn');
  const box = document.getElementById('cloudConfigBox');
  const urlInput = document.getElementById('cfgUrlInput');
  const keyInput = document.getElementById('cfgKeyInput');
  if(warn) warn.style.display = badConfig ? 'block' : 'none';
  if(box) box.open = badConfig;
  const stored = readStoredConfig();
  const c = !configIsBad(stored) ? stored : (window.EMLAK_CRM_CONFIG || {});
  if(urlInput && c.SUPABASE_URL && !String(c.SUPABASE_URL).includes('BURAYA_')) urlInput.value = c.SUPABASE_URL;
  if(keyInput && c.SUPABASE_KEY && !String(c.SUPABASE_KEY).includes('BURAYA_')) keyInput.value = c.SUPABASE_KEY;
}
function refreshSupabaseClient(){
  cfg = getEffectiveConfig();
  badConfig = configIsBad(cfg);
  sb = badConfig ? null : supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
  updateConfigUi();
  return !badConfig;
}
function setupConfigButtons(){
  updateConfigUi();
  const save = document.getElementById('saveCfgBtn');
  const clear = document.getElementById('clearCfgBtn');
  if(save) save.onclick = async () => {
    const url = (document.getElementById('cfgUrlInput')?.value || '').trim();
    const key = (document.getElementById('cfgKeyInput')?.value || '').trim();
    const msg = document.getElementById('cfgMsg');
    const next = {SUPABASE_URL:url, SUPABASE_KEY:key};
    if(configIsBad(next)){ if(msg) msg.textContent = 'Hatalı ayar. URL https://xxxxx.supabase.co formatında olmalı ve key boş olmamalı.'; return; }
    localStorage.setItem('emlak_crm_supabase_config', JSON.stringify(next));
    refreshSupabaseClient();
    if(msg) msg.textContent = 'Ayar kaydedildi. Şimdi e-posta ve şifreyle giriş yapabilirsin.';
    await authInit();
  };
  if(clear) clear.onclick = () => {
    localStorage.removeItem('emlak_crm_supabase_config');
    refreshSupabaseClient();
    const msg = document.getElementById('cfgMsg');
    if(msg) msg.textContent = 'Tarayıcıdaki Supabase ayarı temizlendi.';
  };
}

refreshSupabaseClient();
document.addEventListener('DOMContentLoaded', setupConfigButtons);

let session = null;
let currentUser = null;
let cache = { kisiler: [], portfoyler: [], ilanlar: [], gorevler: [], notlar: [] };
const sections = ['dashboard','arama','mahalle','kisiler','portfoyler','ilanlar','eslesme','mesajlar','gorevler','ayarlar'];
const navNames = {dashboard:'📊 Dashboard',arama:'🔎 Müşteri Arama Asistanı',mahalle:'🗺️ Mahalle Takibi',kisiler:'👥 Kişiler',portfoyler:'🏘️ Portföyler',ilanlar:'🗂️ İlan Arşivi',eslesme:'🎯 Eşleştirme',gorevler:'✅ Görevler',mesajlar:'📣 Mesajlar',ayarlar:'⚙️ Ayarlar'};

const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num = (v)=>{ if(v===null||v===undefined||v==='') return null; const n=Number(String(v).replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',', '.')); return Number.isFinite(n)?n:null; };
const money = (v)=> v==null || v==='' ? '-' : Number(v).toLocaleString('tr-TR')+' TL';
const cleanDigits = (s)=>String(s||'').replace(/\D/g,'');
function formatMoneyInput(el){ const n=cleanDigits(el.value); el.value=n?Number(n).toLocaleString('tr-TR'):''; }
function normalizePhoneForSave(v){ let d=cleanDigits(v); if(d.startsWith('90') && d.length===12) d='0'+d.slice(2); if(d.length===10 && d.startsWith('5')) d='0'+d; return d.slice(0,11); }
function formatTRPhone(p){ const d=normalizePhoneForSave(p); if(!d) return ''; if(d.length===11) return `${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)} ${d.slice(7,9)} ${d.slice(9,11)}`; return d; }
function waLink(phone){ let p=normalizePhoneForSave(phone); if(!p) return ''; if(p.startsWith('0')) p='90'+p.slice(1); if(!p.startsWith('90') && p.length===10) p='90'+p; return `https://wa.me/${p}`; }
function waHtml(phone){ const u=waLink(phone); return u ? `<a class="wa" target="_blank" href="${u}">💬 WhatsApp Aç</a>` : '-'; }
function waTextLink(phone,text){ const u=waLink(phone); return u ? `${u}?text=${encodeURIComponent(text||'')}` : ''; }
function callLink(phone){ const d=normalizePhoneForSave(phone); return d ? `tel:${d}` : ''; }
function callHtml(phone){ const u=callLink(phone); return u ? `<a class="call" href="${u}">📞 Direkt Ara</a>` : '-'; }
function contactActions(phone){ return `<div class="actions-stack">${waHtml(phone)}${callHtml(phone)}</div>`; }
function jsStr(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' '); }
function obj(v){ try{return typeof v==='string'?JSON.parse(v||'{}'):(v||{});}catch{return {}} }
function fileMeta(portfoy,key){ const d=obj(portfoy.detaylar); return d?.dosyalar?.[key] || null; }
function photoMetas(portfoy){ const d=obj(portfoy.detaylar); const arr=Array.isArray(d?.dosyalar?.gorseller)?d.dosyalar.gorseller:[]; if(arr.length) return arr; return parseArr(portfoy.foto_urls).map((url,i)=>({url,path:'',name:`Görsel ${i+1}`})); }
async function openStoredFile(path,url){
  try{
    if(path){ const {data,error}=await sb.storage.from('ilan-gorselleri').createSignedUrl(path,60*10); if(error) throw error; if(data?.signedUrl){ window.open(data.signedUrl,'_blank'); return; } }
    if(url){ window.open(url,'_blank'); return; }
    alert('Dosya linki bulunamadı.');
  }catch(e){ alert('Dosya açılamadı: '+(e.message||e)); }
}
function fileButton(label,meta,urlFallback){ const path=meta?.path||''; const url=meta?.url||urlFallback||''; return (path||url)?`<button class="linkbtn" onclick="openStoredFile('${jsStr(path)}','${jsStr(url)}')">${label}</button>`:''; }
function photoThumbHtml(p){ const photos=photoMetas(p); const first=photos[0]; if(!first) return '-'; return `<button class="imgbtn" title="Görseli aç" onclick="openStoredFile('${jsStr(first.path)}','${jsStr(first.url)}')"><img class="thumb" src="${esc(first.url||'')}"></button><div class="muted">${photos.length} görsel</div>`; }
function portfolioFileLinks(p){ const parts=[]; const photos=photoMetas(p); photos.slice(0,3).forEach((m,i)=>parts.push(fileButton(`🖼️ Görsel ${i+1}`,m))); const soz=fileMeta(p,'sozlesme'); const tapu=fileMeta(p,'tapu'); const sozBtn=fileButton('📄 Sözleşme PDF',soz,p.sozlesme_url); const tapuBtn=fileButton('🧾 Tapu Görseli',tapu,p.tapu_url); if(sozBtn) parts.push(sozBtn); if(tapuBtn) parts.push(tapuBtn); return parts.length?`<div class="file-actions">${parts.join('')}</div>`:'-'; }

function norm(s){ return String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').trim(); }
function typeGroup(t){ const x=norm(t); if(/konut|daire|ev|villa|apart|rezidans|proje/.test(x)) return 'konut'; if(/arsa|tarla|arazi|bag|bahce/.test(x)) return 'arsa'; if(/is|iş|dukkan|dükkan|ofis|magaza|mağaza|plaza|depo|fabrika|imalathane|otel|tesis/.test(x)) return 'is_yeri'; if(/bina/.test(x)) return 'bina'; if(/turistik/.test(x)) return 'turistik_tesis'; return x || ''; }
function transType(t){ const x=norm(t); if(/devren.*sat/.test(x)) return 'devren_satilik'; if(/devren.*kira/.test(x)) return 'devren_kiralik'; if(/kat.*karsiligi/.test(x)) return 'kat_karsiligi'; if(/kira/.test(x)) return 'kiralik'; if(/sat/.test(x)) return 'satilik'; return x || ''; }
function colorByDiff(diff){ if(diff==null) return 'blue'; if(diff <= -7) return 'green'; if(diff <= 5) return 'blue'; if(diff <= 12) return 'yellow'; return 'red'; }
function statusByDiff(diff){ if(diff==null) return 'emsal yok'; if(diff <= -7) return 'alınabilir / emsal altı'; if(diff <= 5) return 'emsale yakın'; if(diff <= 12) return 'pazarlık gerekir'; return 'pahalı görünüyor'; }
function parseArr(v){ try{ return Array.isArray(v)?v:JSON.parse(v||'[]'); }catch{return []} }
function parseFirstPhoto(v){ return parseArr(v)[0]||''; }
function estatePrice(o){ return num(o.fiyat ?? o.fiyat_text); }
function commission(o){ const fiyat=estatePrice(o); if(!fiyat) return {amount:null,text:'-'}; const islem=transType(o.islem_tipi || o.baslik || ''); if(islem==='kiralik' || islem==='devren_kiralik') return {amount:fiyat,text:`Komisyon: ${money(fiyat)} (1 kira bedeli)`}; const base=fiyat*0.02; const kdv=base*0.20; return {amount:base+kdv,text:`Komisyon: ${money(base+kdv)} (%2 + %20 KDV)`}; }
function comparableFor(target){
  const all=[...cache.portfoyler.map(x=>({...x,_src:'portföy'})), ...cache.ilanlar.map(x=>({...x,_src:'ilan'}))];
  const tPrice=estatePrice(target); const tg=typeGroup(target.tur || target.kategori || target.baslik); const islem=transType(target.islem_tipi || target.baslik);
  const sehir=norm(target.sehir); const ilce=norm(target.ilce); const mahalle=norm(target.mahalle); const oda=norm(target.oda); const m2=num(target.brut_m2 || target.net_m2);
  let comps=all.filter(x=>String(x.id)!==String(target.id || '') && estatePrice(x) && typeGroup(x.tur||x.kategori||x.baslik)===tg);
  if(islem) comps=comps.filter(x=>!transType(x.islem_tipi||x.baslik) || transType(x.islem_tipi||x.baslik)===islem);
  if(sehir) comps=comps.filter(x=>norm(x.sehir)===sehir || !x.sehir);
  if(ilce) comps=comps.filter(x=>norm(x.ilce)===ilce || !x.ilce);
  let strong=comps;
  if(mahalle) strong=strong.filter(x=>norm(x.mahalle)===mahalle || !x.mahalle);
  if(oda) strong=strong.filter(x=>!x.oda || norm(x.oda)===oda);
  if(m2) strong=strong.filter(x=>{ const xm=num(x.brut_m2||x.net_m2); return !xm || Math.abs(xm-m2)/m2 <= .30; });
  if(strong.length<2) strong=comps;
  const prices=strong.map(estatePrice).filter(Boolean).sort((a,b)=>a-b);
  if(!prices.length || !tPrice) return {avg:null,diff:null,count:prices.length,cls:'blue',text:'Emsal yok'};
  const avg=prices.reduce((a,b)=>a+b,0)/prices.length; const diff=((tPrice-avg)/avg)*100;
  return {avg,diff,count:prices.length,cls:colorByDiff(diff),text:`Emsal: ${money(avg)} | ${diff>0?'+':''}${diff.toFixed(1)}% | ${statusByDiff(diff)} | ${prices.length} kayıt`};
}
function compHtml(o){ const c=comparableFor(o); return `<span class="pill ${c.cls}">${esc(c.text)}</span>`; }
function scoreMatch(kisi, asset){
  let score=0, reasons=[];
  const budget=num(kisi.butce_max), price=estatePrice(asset);
  if(typeGroup(kisi.aranan_tur) && typeGroup(asset.tur||asset.kategori||asset.baslik) && typeGroup(kisi.aranan_tur)===typeGroup(asset.tur||asset.kategori||asset.baslik)){score+=25;reasons.push('tür uyuyor')}
  if(transType(kisi.islem_tipi) && transType(asset.islem_tipi||asset.baslik) && transType(kisi.islem_tipi)===transType(asset.islem_tipi||asset.baslik)){score+=15;reasons.push('işlem tipi uyuyor')}
  if(norm(kisi.ilce) && norm(asset.ilce) && norm(kisi.ilce)===norm(asset.ilce)){score+=20;reasons.push('ilçe uyuyor')} else if(norm(kisi.sehir) && norm(asset.sehir) && norm(kisi.sehir)===norm(asset.sehir)){score+=10;reasons.push('şehir uyuyor')}
  if(norm(kisi.mahalle) && norm(asset.mahalle) && norm(kisi.mahalle)===norm(asset.mahalle)){score+=10;reasons.push('mahalle uyuyor')}
  if(budget && price && price<=budget){score+=20;reasons.push('bütçeye uygun')} else if(budget && price && price<=budget*1.10){score+=10;reasons.push('bütçeye yakın')}
  if(norm(kisi.oda) && norm(asset.oda) && norm(kisi.oda)===norm(asset.oda)){score+=10;reasons.push('oda uyuyor')}
  const minm=num(kisi.min_m2), maxm=num(kisi.max_m2), m2=num(asset.brut_m2||asset.net_m2); if(m2 && ((!minm||m2>=minm)&&(!maxm||m2<=maxm))){score+=10;reasons.push('m² uyuyor')}
  return {score:Math.min(score,100), reasons};
}

const ILLER=['Adana','Adıyaman','Afyonkarahisar','Ağrı','Amasya','Ankara','Antalya','Artvin','Aydın','Balıkesir','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Isparta','Mersin','İstanbul','İzmir','Kars','Kastamonu','Kayseri','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa','Kahramanmaraş','Mardin','Muğla','Muş','Nevşehir','Niğde','Ordu','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Tekirdağ','Tokat','Trabzon','Tunceli','Şanlıurfa','Uşak','Van','Yozgat','Zonguldak','Aksaray','Bayburt','Karaman','Kırıkkale','Batman','Şırnak','Bartın','Ardahan','Iğdır','Yalova','Karabük','Kilis','Osmaniye','Düzce'];
const ILCE_MAP={
  'Artvin':['Merkez','Ardanuç','Arhavi','Borçka','Hopa','Kemalpaşa','Murgul','Şavşat','Yusufeli'],
  'Rize':['Merkez','Ardeşen','Çamlıhemşin','Çayeli','Derepazarı','Fındıklı','Güneysu','Hemşin','İkizdere','İyidere','Kalkandere','Pazar'],
  'Trabzon':['Merkez','Akçaabat','Araklı','Arsin','Beşikdüzü','Çarşıbaşı','Çaykara','Dernekpazarı','Düzköy','Hayrat','Köprübaşı','Maçka','Of','Ortahisar','Sürmene','Şalpazarı','Tonya','Vakfıkebir','Yomra']
};
const MAHALLE_HINTS={
  'Hopa':['Sundura Mah.','Ortahopa Mah.','Kuledibi Mah.','Merkez Mah.','Bucak Mah.','Cumhuriyet Mah.'],
  'Arhavi':['Musazade Mah.','Boğaziçi Mah.','Kavak Mah.','Yukarı Hacılar Mah.','Aşağı Hacılar Mah.'],
  'Kemalpaşa':['Merkez Mah.','Köprücü Mah.','Çamurlu Mah.']
};

function detectLocationFromText(txt){
  const raw=String(txt||''); const nt=norm(raw); if(!nt) return null;
  const candidates=[];
  for(const [sehir,ilceler] of Object.entries(ILCE_MAP)){
    const si=nt.indexOf(norm(sehir)); if(si<0) continue;
    for(const ilce of ilceler){ const ii=nt.indexOf(norm(ilce)); if(ii<0) continue; candidates.push({sehir,ilce,score:(ilce==='Merkez'?100:0)+Math.abs(ii-si)}); }
  }
  if(!candidates.length) return null;
  candidates.sort((a,b)=>a.score-b.score);
  const best=candidates[0]; let mahalle='';
  const parts=String(raw).split(/\n|\r|\/|>|›|»|,|\|/).map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  const idx=parts.findIndex(x=>norm(x)===norm(best.ilce));
  if(idx>=0){
    for(let j=idx+1;j<Math.min(parts.length,idx+4);j++){
      const cand=parts[j];
      if(cand && cand.length<80 && !/emlak|konut|arsa|iş yeri|satılık|kiralık|ilan|tl|m²/i.test(cand) && !Object.keys(ILCE_MAP).some(p=>norm(p)===norm(cand)) && !(ILCE_MAP[best.sehir]||[]).some(d=>norm(d)===norm(cand))){ mahalle=cand; break; }
    }
  }
  if(!mahalle){ const hints=MAHALLE_HINTS[best.ilce]||[]; const found=hints.find(h=>nt.includes(norm(h).replace(/ mah\.?$/,''))); if(found) mahalle=found; }
  return {sehir:best.sehir, ilce:best.ilce, mahalle};
}
function applyLocationFixToRecord(a){
  if(!a) return a;
  const loc=detectLocationFromText([a.konum,a.baslik,a.aciklama].filter(Boolean).join(' / '));
  if(loc && loc.sehir && loc.ilce){
    if(!a.sehir || norm(a.sehir)!==norm(loc.sehir)) a.sehir=loc.sehir;
    if(!a.ilce || norm(a.ilce)==='merkez' || norm(a.ilce)!==norm(loc.ilce)) a.ilce=loc.ilce;
    if(loc.mahalle && (!a.mahalle || norm(a.mahalle)!==norm(loc.mahalle))) a.mahalle=loc.mahalle;
  }
  return a;
}
function normalizeCacheLocations(){
  ['ilanlar','portfoyler'].forEach(k=>{ cache[k]=(cache[k]||[]).map(x=>applyLocationFixToRecord({...x})); });
}
const ODA_KISI=['1+1','2+1','3+1','4+1','5+1','Diğer'];
const ODA_KONUT=['1+1','2+1','3+1','4+1','Dublex','Diğer'];
const PORTFOY_TURLER=['Konut','İş Yeri','Arsa','Bina','Turistik Tesis','Devre Mülk','Konut Projesi'];
const IS_YERI_TURLERI=['Akaryakıt İstasyonu','Apartman Dairesi','Atölye','Çiftlik','Depo & Antrepo','Dükkan & Mağaza','Fabrika & Üretim Tesisi','Garaj & Park Yeri','Hamam, Sauna & Spa','İmalathane','İş Hanı Katı & Ofisi','Komple Bina','Maden Ocağı','Ofis & Büro','Okul','Otopark','Pazar Yeri','Plaza','Plaza Katı & Ofisi','Rezidans Katı & Ofisi','Spor Tesisi','Toplantı & Etkinlik Salonu','Villa'];
const IMAR_DURUMLARI=['Arazi','Bağ & Bahçe','Depo & Antrepo','Eğitim','Konut','Toplu Konut','Turizm','Turizm + Ticari','Ticari','Ticari + Konut','Sağlık','Sanayi','Sit Alanı','Tarla','Diğer'];
function selectOptions(arr,selected=''){ return arr.map(x=>`<option ${x===selected?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join(''); }
function buttonGroup(prefix,name,items,selected){ return `<div class="seg" data-target="${prefix}_${name}">${items.map(x=>`<button type="button" class="segbtn ${x===selected?'active':''}" onclick="setSeg('${prefix}_${name}','${esc(x)}',this)">${esc(x)}</button>`).join('')}<input type="hidden" id="${prefix}_${name}" value="${esc(selected||items[0]||'')}"></div>`; }
window.setSeg=(id,val,btn)=>{ $(id).value=val; btn.parentElement.querySelectorAll('.segbtn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); if(id==='portfoy_tur') renderPortfoyDynamic(val); };
function locationFields(prefix){ return `<div class="row"><div class="field"><label>İl</label><select id="${prefix}_sehir" onchange="fillDistricts('${prefix}')"><option value="">Seç</option>${selectOptions(ILLER)}</select></div><div class="field"><label>İlçe</label><select id="${prefix}_ilce" onchange="fillMahalleHints('${prefix}')"><option value="">Önce il seç</option></select></div><div class="field"><label>Mahalle</label><input list="${prefix}_mahalle_list" id="${prefix}_mahalle" placeholder="Mahalle yaz/seç"><datalist id="${prefix}_mahalle_list"></datalist></div></div>`; }
window.fillDistricts=(prefix)=>{ const sehir=$(`${prefix}_sehir`).value; const sel=$(`${prefix}_ilce`); const arr=ILCE_MAP[sehir]||[]; sel.innerHTML='<option value="">Seç / elle yaz</option>'+selectOptions(arr); fillMahalleHints(prefix); };
window.fillMahalleHints=(prefix)=>{ const ilce=$(`${prefix}_ilce`).value; const dl=$(`${prefix}_mahalle_list`); const arr=MAHALLE_HINTS[ilce]||[]; dl.innerHTML=arr.map(x=>`<option value="${esc(x)}"></option>`).join(''); };
function odaField(prefix, arr){ return `<div class="field"><label>Oda Sayısı</label><select id="${prefix}_oda" onchange="toggleOther('${prefix}_oda','${prefix}_oda_diger')"><option value="">Seç</option>${selectOptions(arr)}</select></div><div class="field other" id="${prefix}_oda_diger_wrap" style="display:none"><label>Diğer Oda</label><input id="${prefix}_oda_diger" placeholder="Örn: 5+2"></div>`; }
window.toggleOther=(selectId,inputId)=>{ const show=$(selectId).value==='Diğer'; $(inputId+'_wrap').style.display=show?'flex':'none'; if(!show) $(inputId).value=''; };
function moneyField(id,label){ return `<div class="field"><label>${label}</label><input id="${id}" class="money-input" inputmode="numeric" placeholder="3.000.000 TL" oninput="formatMoneyInput(this)"></div>`; }
function phoneField(id,label='Telefon'){ return `<div class="field"><label>${label}</label><input id="${id}" class="phone-input" inputmode="numeric" maxlength="11" placeholder="05XXXXXXXXX" oninput="this.value=normalizePhoneForSave(this.value)"></div>`; }
function tcField(id,label='TC Kimlik No'){ return `<div class="field"><label>${label}</label><input id="${id}" inputmode="numeric" maxlength="11" placeholder="11 haneli" oninput="this.value=cleanDigits(this.value).slice(0,11)"></div>`; }
function val(id){ const el=$(id); return el ? String(el.value||'').trim() : ''; }
function valNum(id){ return num(val(id)); }
function validatePhone(v){ const d=normalizePhoneForSave(v); return !d || (d.length===11 && d.startsWith('0')); }
function validateTc(v){ const d=cleanDigits(v); return !d || d.length===11; }

async function authInit(){
  if(!sb) return;
  const {data}=await sb.auth.getSession(); session=data.session; currentUser=session?.user || null; updateAuthView();
  sb.auth.onAuthStateChange((event,s)=>{session=s;currentUser=s?.user||null;updateAuthView();});
}
function updateAuthView(){
  if(currentUser){ $('loginView').style.display='none'; $('appView').style.display='block'; $('userLine').textContent='Giriş yapan: '+currentUser.email; buildNav(); loadAll(); }
  else { $('loginView').style.display='block'; $('appView').style.display='none'; }
}
function buildNav(){ $('nav').innerHTML=sections.map(s=>`<button data-sec="${s}" class="${s==='dashboard'?'active':''}">${navNames[s]}</button>`).join(''); document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>showSec(b.dataset.sec)); }
function showSec(id){ sections.forEach(s=>$(s).classList.toggle('active',s===id)); document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.sec===id)); renderSection(id); }
async function loadAll(){ await Promise.all([loadTable('kisiler'),loadTable('portfoyler'),loadTable('ilan_arsivi','ilanlar'),loadTable('gorevler')]); normalizeCacheLocations(); renderAll(); }
async function loadTable(table,key){ const {data,error}=await sb.from(table).select('*').order('created_at',{ascending:false}); if(error) alert(table+' yüklenemedi: '+error.message); else cache[key||table]=data||[]; }
function renderAll(){ sections.forEach(renderSection); }
function renderSection(id){ if(!currentUser) return; if(id==='dashboard') renderDashboard(); if(id==='arama') renderAramaAsistani(); if(id==='mahalle') renderMahalleTakibi(); if(id==='kisiler') renderKisiler(); if(id==='portfoyler') renderPortfoyler(); if(id==='ilanlar') renderIlanlar(); if(id==='eslesme') renderEslesme(); if(id==='mesajlar') renderMesajlar(); if(id==='gorevler') renderGorevler(); if(id==='ayarlar') renderAyarlar(); }

function renderDashboard(){
  const buyers=cache.kisiler.filter(k=>/alici|ikisi/.test(norm(k.tip))).length; const assets=[...cache.portfoyler, ...cache.ilanlar];
  const alerts=[]; cache.kisiler.filter(k=>/alici|ikisi/.test(norm(k.tip))).forEach(k=>assets.forEach(a=>{ const m=scoreMatch(k,a); if(m.score>=35) alerts.push({k,a,m}); })); alerts.sort((x,y)=>y.m.score-x.m.score);
  $('dashboard').innerHTML=`<div class="grid"><div class="card"><b>${cache.kisiler.length}</b><br><span class="muted">Kişi</span></div><div class="card"><b>${buyers}</b><br><span class="muted">Alıcı</span></div><div class="card"><b>${cache.portfoyler.length}</b><br><span class="muted">Portföy</span></div><div class="card"><b>${cache.ilanlar.length}</b><br><span class="muted">İlan arşivi</span></div></div>
  <div class="card" style="margin-top:12px"><h3>🔥 Eşleşme Uyarıları - Bu ilanları incele</h3><div class="muted">Eşleştirme verisi: ${buyers} alıcı, ${assets.length} portföy/ilan. Min skor: 35.</div>${alerts.length?matchTable(alerts.slice(0,20)):'<p class="muted">Şu an eşleşme yok. Alıcı bütçe/bölge/tür bilgilerini ve ilan fiyat/konum/tür alanlarını doldur.</p>'}</div>`;
}
function matchTable(rows){ return `<div class="table-wrap"><table class="table"><thead><tr><th>Skor</th><th>Alıcı</th><th>İlan/Portföy</th><th>Fiyat</th><th>Emsal</th><th>Komisyon</th><th>İletişim</th></tr></thead><tbody>${rows.map(r=>{const c=commission(r.a); return `<tr><td><b>${r.m.score}</b><br><span class="muted">${esc(r.m.reasons.join(', '))}</span></td><td>${esc(r.k.ad_soyad)}<br>${esc(formatTRPhone(r.k.telefon)||'')}</td><td>${esc(r.a.baslik||r.a.url||'-')}<br><span class="muted">${esc([r.a.sehir,r.a.ilce,r.a.mahalle].filter(Boolean).join(' / '))}</span></td><td>${money(estatePrice(r.a))}</td><td>${compHtml(r.a)}</td><td>${esc(c.text)}</td><td>${contactActions(r.k.telefon)}</td></tr>`}).join('')}</tbody></table></div>` }

async function upsert(table,obj,id){ let q=id?sb.from(table).update(obj).eq('id',id):sb.from(table).insert(obj); const {error}=await q; if(error) alert('Kayıt hatası: '+error.message); else { await loadAll(); } }
async function del(table,id){ if(!confirm('Bu kayıt silinsin mi?')) return; const {error}=await sb.from(table).delete().eq('id',id); if(error) alert('Silme hatası: '+error.message); else await loadAll(); }
async function uploadOne(file,folder){ if(!file) return null; const safe=file.name.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ._-]/g,'_'); const path=`${currentUser.id}/${folder}/${Date.now()}_${safe}`; const {error}=await sb.storage.from('ilan-gorselleri').upload(path,file,{upsert:true}); if(error){ alert('Dosya yükleme hatası: '+error.message); return null; } const {data}=await sb.storage.from('ilan-gorselleri').createSignedUrl(path, 60*60*24*365*5); return {path, url:data?.signedUrl || '', name:file.name, type:file.type}; }
async function uploadFiles(inputId,folder,max){ const el=$(inputId); if(!el || !el.files || !el.files.length) return []; const files=[...el.files].slice(0,max||99); const out=[]; for(const f of files){ const u=await uploadOne(f,folder); if(u) out.push(u); } return out; }

function renderKisiler(){
  $('kisiler').innerHTML=`<div class="two"><div class="card"><h3>Kişi Ekle</h3>
  <div class="field"><label>Tip</label><select id="kisi_tip"><option value="alici">Alıcı</option><option value="satici">Satıcı</option><option value="ikisi">İkisi</option></select></div>
  <div class="field"><label>Ad Soyad</label><input id="kisi_ad_soyad"></div>${phoneField('kisi_telefon')}${tcField('kisi_tc_kimlik')}
  ${locationFields('kisi')}
  <div class="field"><label>Aranan Tür</label><select id="kisi_aranan_tur"><option>Konut</option><option>İş Yeri</option><option>Arsa</option><option>Bina</option><option>Turistik Tesis</option><option>Devre Mülk</option><option>Konut Projesi</option></select></div>
  <div class="field"><label>Satılık / Kiralık</label>${buttonGroup('kisi','islem_tipi',['Satılık','Kiralık'],'Satılık')}</div>
  <div class="row">${moneyField('kisi_butce_min','Bütçe Min')}${moneyField('kisi_butce_max','Bütçe Max')}</div>
  <div class="row">${odaField('kisi',ODA_KISI)}<div class="field"><label>Min m²</label><input id="kisi_min_m2" inputmode="numeric"></div><div class="field"><label>Max m²</label><input id="kisi_max_m2" inputmode="numeric"></div></div>
  <div class="field"><label>Notlar</label><textarea id="kisi_notlar"></textarea></div><button class="btn" onclick="saveKisi()">Kaydet</button></div><div class="card"><h3>Kişiler</h3>${tableKisiler()}</div></div>`;
}
window.saveKisi=async()=>{
  const telefon=normalizePhoneForSave(val('kisi_telefon')), tc=cleanDigits(val('kisi_tc_kimlik')); if(!validatePhone(telefon)) return alert('Telefon 05XXXXXXXXX formatında 11 haneli olmalı.'); if(!validateTc(tc)) return alert('TC Kimlik 11 haneli olmalı.');
  const oda=val('kisi_oda')==='Diğer'?val('kisi_oda_diger'):val('kisi_oda');
  const o={tip:val('kisi_tip'),ad_soyad:val('kisi_ad_soyad'),telefon,tc_kimlik:tc,sehir:val('kisi_sehir'),ilce:val('kisi_ilce'),mahalle:val('kisi_mahalle'),aranan_tur:val('kisi_aranan_tur'),islem_tipi:val('kisi_islem_tipi'),butce_min:valNum('kisi_butce_min'),butce_max:valNum('kisi_butce_max'),oda,min_m2:valNum('kisi_min_m2'),max_m2:valNum('kisi_max_m2'),notlar:val('kisi_notlar')};
  await upsert('kisiler',o);
};
function tableKisiler(){ return `<div class="table-wrap"><table class="table"><thead><tr><th>Kişi</th><th>Aradığı</th><th>Bütçe</th><th>İletişim</th><th></th></tr></thead><tbody>${cache.kisiler.map(k=>`<tr><td><b>${esc(k.ad_soyad)}</b><br>${esc(formatTRPhone(k.telefon)||'')}<br><span class="muted">TC: ${esc(k.tc_kimlik||'-')}</span><br><span class="muted">${esc([k.sehir,k.ilce,k.mahalle].filter(Boolean).join(' / '))}</span></td><td>${esc(k.tip)}<br>${esc([k.aranan_tur,k.islem_tipi,k.oda].filter(Boolean).join(' / '))}</td><td>${money(k.butce_min)} - ${money(k.butce_max)}</td><td>${contactActions(k.telefon)}</td><td><button class="btn small danger" onclick="del('kisiler','${k.id}')">Sil</button></td></tr>`).join('')}</tbody></table></div>` }

function renderPortfoyler(){
  $('portfoyler').innerHTML=`<div class="card"><h3>Portföy Ekle</h3><div class="form-section"><h4>Satıcı Bilgileri</h4><div class="row"><div class="field"><label>İsim Soyisim</label><input id="portfoy_satici_ad_soyad"></div>${phoneField('portfoy_satici_telefon','Telefon Numarası')}${tcField('portfoy_satici_tc','TC Kimlik No')}</div></div>
  <div class="form-section"><h4>Portföy Türü</h4>${buttonGroup('portfoy','tur',PORTFOY_TURLER,'Konut')}</div><div id="portfoyDynamic"></div><button class="btn primary" onclick="savePortfoy()">Portföyü Kaydet</button></div><div class="card" style="margin-top:12px"><h3>Portföyler</h3>${tablePortfoy()}</div>`;
  renderPortfoyDynamic('Konut');
}
window.renderPortfoyDynamic=(tur)=>{
  const commonFiles=`<div class="form-section"><h4>Görsel / Evrak</h4><div class="row"><div class="field"><label>Portföy Görselleri (en fazla 3)</label><input id="portfoy_gorseller" type="file" accept="image/*" multiple></div><div class="field"><label>Sözleşme PDF</label><input id="portfoy_sozlesme" type="file" accept="application/pdf"></div><div class="field"><label>Tapu Görseli</label><input id="portfoy_tapu" type="file" accept="image/*"></div></div></div>`;
  let html='';
  if(tur==='Konut') html=`<div class="form-section"><h4>Konut Bilgileri</h4><div class="field"><label>İşlem Tipi</label>${buttonGroup('portfoy','islem_tipi',['Satılık','Kiralık'],'Satılık')}</div>${locationFields('portfoy')}<div class="row">${odaField('portfoy',ODA_KONUT)}<div class="field"><label>Brüt m²</label><input id="portfoy_brut_m2" inputmode="numeric"></div><div class="field"><label>Net m²</label><input id="portfoy_net_m2" inputmode="numeric"></div>${moneyField('portfoy_fiyat','Fiyat')}</div><div class="field"><label>Başlık</label><input id="portfoy_baslik" placeholder="Örn: Hopa 3+1 Satılık Daire"></div><div class="field"><label>Açıklama</label><textarea id="portfoy_aciklama"></textarea></div></div>${commonFiles}`;
  else if(tur==='İş Yeri') html=`<div class="form-section"><h4>İş Yeri Bilgileri</h4><div class="field"><label>İşlem Tipi</label>${buttonGroup('portfoy','islem_tipi',['Satılık','Kiralık','Devren Kiralık','Devren Satılık'],'Satılık')}</div><div class="field"><label>İş Yeri Tipi</label><select id="portfoy_alt_tur">${selectOptions(IS_YERI_TURLERI)}</select></div>${locationFields('portfoy')}<div class="row"><div class="field"><label>Brüt m²</label><input id="portfoy_brut_m2" inputmode="numeric"></div><div class="field"><label>Net m²</label><input id="portfoy_net_m2" inputmode="numeric"></div>${moneyField('portfoy_fiyat','Fiyat')}<div class="field"><label>Kiracılı mı?</label><select id="portfoy_kiracili"><option value="false">Hayır</option><option value="true">Evet</option></select></div></div><div class="field"><label>Başlık</label><input id="portfoy_baslik"></div><div class="field"><label>Açıklama</label><textarea id="portfoy_aciklama"></textarea></div></div>${commonFiles}`;
  else if(tur==='Arsa') html=`<div class="form-section"><h4>Arsa Bilgileri</h4><div class="field"><label>İşlem Tipi</label>${buttonGroup('portfoy','islem_tipi',['Kat Karşılığı Satılık','Satılık','Kiralık'],'Satılık')}</div>${locationFields('portfoy')}<div class="field"><label>İmar Durumu</label><div class="checks">${IMAR_DURUMLARI.map(x=>`<label><input type="checkbox" name="imar" value="${esc(x)}" onchange="toggleImarOther()"> ${esc(x)}</label>`).join('')}</div><input id="portfoy_imar_diger" style="display:none;margin-top:8px" placeholder="Diğer imar durumunu yaz"></div><div class="row"><div class="field"><label>Brüt m²</label><input id="portfoy_brut_m2" inputmode="numeric"></div><div class="field"><label>Net m²</label><input id="portfoy_net_m2" inputmode="numeric"></div>${moneyField('portfoy_fiyat','Fiyat')}<div class="field"><label>Ada No</label><input id="portfoy_ada_no"></div><div class="field"><label>Parsel No</label><input id="portfoy_parsel_no"></div></div><div class="field"><label>Başlık</label><input id="portfoy_baslik"></div><div class="field"><label>Açıklama</label><textarea id="portfoy_aciklama"></textarea></div></div>${commonFiles}`;
  else html=`<div class="form-section"><h4>${esc(tur)} Bilgileri</h4><div class="field"><label>İşlem Tipi</label>${buttonGroup('portfoy','islem_tipi',['Satılık','Kiralık'],'Satılık')}</div>${locationFields('portfoy')}<div class="row"><div class="field"><label>Brüt m²</label><input id="portfoy_brut_m2" inputmode="numeric"></div><div class="field"><label>Net m²</label><input id="portfoy_net_m2" inputmode="numeric"></div>${moneyField('portfoy_fiyat','Fiyat')}</div><div class="field"><label>Başlık</label><input id="portfoy_baslik"></div><div class="field"><label>Açıklama</label><textarea id="portfoy_aciklama"></textarea></div></div>${commonFiles}`;
  $('portfoyDynamic').innerHTML=html;
};
window.toggleImarOther=()=>{ const other=[...document.querySelectorAll('input[name="imar"]')].some(x=>x.checked && x.value==='Diğer'); const el=$('portfoy_imar_diger'); if(el) el.style.display=other?'block':'none'; };
window.savePortfoy=async()=>{
  const telefon=normalizePhoneForSave(val('portfoy_satici_telefon')), tc=cleanDigits(val('portfoy_satici_tc')); if(!validatePhone(telefon)) return alert('Satıcı telefonu 05XXXXXXXXX formatında 11 haneli olmalı.'); if(!validateTc(tc)) return alert('Satıcı TC Kimlik 11 haneli olmalı.');
  const tur=val('portfoy_tur'); const oda=val('portfoy_oda')==='Diğer'?val('portfoy_oda_diger'):val('portfoy_oda');
  const imar=[...document.querySelectorAll('input[name="imar"]')].filter(x=>x.checked).map(x=>x.value); const imarDiger=val('portfoy_imar_diger'); if(imarDiger) imar.push(imarDiger);
  const folder=`portfoyler/${Date.now()}`; const imgs=await uploadFiles('portfoy_gorseller',folder+'/gorseller',3); const soz=(await uploadFiles('portfoy_sozlesme',folder+'/sozlesme',1))[0]||null; const tapu=(await uploadFiles('portfoy_tapu',folder+'/tapu',1))[0]||null;
  const foto_urls=imgs.map(x=>x.url).filter(Boolean);
  const detaylar={ada_no:val('portfoy_ada_no'),parsel_no:val('portfoy_parsel_no'),dosyalar:{gorseller:imgs,sozlesme:soz,tapu:tapu}};
  const o={baslik:val('portfoy_baslik')||[val('portfoy_sehir'),val('portfoy_ilce'),tur,val('portfoy_islem_tipi')].filter(Boolean).join(' '),tur,islem_tipi:val('portfoy_islem_tipi'),fiyat:valNum('portfoy_fiyat'),sehir:val('portfoy_sehir'),ilce:val('portfoy_ilce'),mahalle:val('portfoy_mahalle'),oda,brut_m2:valNum('portfoy_brut_m2'),net_m2:valNum('portfoy_net_m2'),satici_ad_soyad:val('portfoy_satici_ad_soyad'),satici_telefon:telefon,satici_tc:tc,alt_tur:val('portfoy_alt_tur'),kiracili:val('portfoy_kiracili')==='true',imar_durumlari:imar,foto_urls,sozlesme_url:soz?.url||null,tapu_url:tapu?.url||null,detaylar,aciklama:val('portfoy_aciklama')};
  await upsert('portfoyler',o);
};
function fileLinks(p){ return portfolioFileLinks(p); }
function tablePortfoy(){ return `<div class="table-wrap"><table class="table"><thead><tr><th>Görsel</th><th>Portföy</th><th>Fiyat</th><th>Satıcı</th><th>Dosyalar</th><th></th></tr></thead><tbody>${cache.portfoyler.map(p=>{const c=commission(p);return `<tr><td>${photoThumbHtml(p)}</td><td><b>${esc(p.baslik)}</b><br><span class="muted">${esc([p.tur,p.alt_tur,p.islem_tipi,p.sehir,p.ilce,p.mahalle,p.oda].filter(Boolean).join(' / '))}</span><br><span class="muted">${p.kiracili?'Kiracılı: Evet':''} ${parseArr(p.imar_durumlari).length?'İmar: '+parseArr(p.imar_durumlari).join(', '):''}</span></td><td>${money(p.fiyat)}<br>${compHtml(p)}<br><span class="muted">${esc(c.text)}</span></td><td>${esc(p.satici_ad_soyad||'-')}<br>${esc(formatTRPhone(p.satici_telefon)||'')}<br><span class="muted">TC: ${esc(p.satici_tc||'-')}</span><br>${contactActions(p.satici_telefon)}</td><td>${fileLinks(p)}</td><td><button class="btn small" onclick="goMatchAsset('${p.id}','portfoy')">Alıcı bul</button> <button class="btn small danger" onclick="del('portfoyler','${p.id}')">Sil</button></td></tr>`}).join('')}</tbody></table></div>` }


function renderIlanlar(){ $('ilanlar').innerHTML=`<div class="card"><h3>İlan Arşivi</h3><p class="muted">Sahibinden eklentisi cloud ayarı yapıldıktan sonra buraya otomatik düşer. Şimdilik manuel kayıt da ekleyebilirsin.</p>${manualIlanForm()}${tableIlanlar()}</div>`; }
function manualIlanForm(){return `<details><summary><b>Manuel İlan Ekle</b></summary><div class="row"><div class="field"><label>İlan No</label><input id="ilan_ilan_no"></div><div class="field"><label>URL</label><input id="ilan_url"></div><div class="field"><label>Başlık</label><input id="ilan_baslik"></div><div class="field"><label>Tür</label><select id="ilan_tur">${selectOptions(PORTFOY_TURLER)}</select></div><div class="field"><label>İşlem</label>${buttonGroup('ilan','islem_tipi',['Satılık','Kiralık'],'Satılık')}</div>${moneyField('ilan_fiyat','Fiyat')}${locationFields('ilan')}${odaField('ilan',ODA_KONUT)}<div class="field"><label>Brüt m²</label><input id="ilan_brut_m2"></div><div class="field"><label>Net m²</label><input id="ilan_net_m2"></div><div class="field"><label>İsim</label><input id="ilan_ad_soyad"></div>${phoneField('ilan_telefon')}<div class="field"><label>Foto URL, virgülle</label><input id="ilan_foto_urls"></div><button class="btn" onclick="saveIlan()">İlan Kaydet</button></div></details><hr>`}
window.saveIlan=()=>{ const oda=val('ilan_oda')==='Diğer'?val('ilan_oda_diger'):val('ilan_oda'); const photos=val('ilan_foto_urls').split(',').map(x=>x.trim()).filter(Boolean); const o={ilan_no:val('ilan_ilan_no'),url:val('ilan_url'),baslik:val('ilan_baslik'),tur:val('ilan_tur'),islem_tipi:val('ilan_islem_tipi'),fiyat:valNum('ilan_fiyat'),sehir:val('ilan_sehir'),ilce:val('ilan_ilce'),mahalle:val('ilan_mahalle'),oda,brut_m2:valNum('ilan_brut_m2'),net_m2:valNum('ilan_net_m2'),ad_soyad:val('ilan_ad_soyad'),telefon:normalizePhoneForSave(val('ilan_telefon')),foto_urls:photos}; upsert('ilan_arsivi',o); };
function tableIlanlar(){ return `<div class="table-wrap"><table class="table"><thead><tr><th>Görsel</th><th>İlan</th><th>Fiyat</th><th>Kişi</th><th></th></tr></thead><tbody>${cache.ilanlar.map(i=>{const photo=parseFirstPhoto(i.foto_urls);const c=commission(i);return `<tr><td>${photo?`<button class="imgbtn" onclick="openStoredFile('','${jsStr(photo)}')"><img class="thumb" src="${esc(photo)}"></button>`:'-'}</td><td><b>${esc(i.baslik||i.ilan_no||'-')}</b><br><span class="muted">${esc([i.tur,i.islem_tipi,i.sehir,i.ilce,i.mahalle,i.oda].filter(Boolean).join(' / '))}</span><br>${i.url?`<a target="_blank" class="muted" href="${esc(i.url)}">İlana git</a>`:''}</td><td>${money(estatePrice(i))}<br>${compHtml(i)}<br><span class="muted">${esc(c.text)}</span></td><td>${esc(i.ad_soyad||'-')}<br>${esc(formatTRPhone(i.telefon)||'')}<br>${contactActions(i.telefon)}</td><td><button class="btn small" onclick="goMatchAsset('${i.id}','ilan')">Alıcı bul</button> <button class="btn small danger" onclick="del('ilan_arsivi','${i.id}')">Sil</button></td></tr>`}).join('')}</tbody></table></div>` }


window.goMatchAsset=(id,type)=>{ showSec('eslesme'); setTimeout(()=>{ $('matchAsset').value=type+':'+id; runAssetMatch(); },50); };
function renderEslesme(){ const buyers=cache.kisiler.filter(k=>/alici|ikisi/.test(norm(k.tip))); const assets=[...cache.portfoyler.map(x=>({...x,_type:'portfoy'})),...cache.ilanlar.map(x=>({...x,_type:'ilan'}))]; $('eslesme').innerHTML=`<div class="card"><h3>Eşleştirme</h3><div class="muted">Veri: ${buyers.length} alıcı, ${assets.length} portföy/ilan.</div><div class="row"><div class="field"><label>Portföy/İlan seç</label><select id="matchAsset"><option value="">Seç</option>${assets.map(a=>`<option value="${a._type}:${a.id}">${esc((a._type==='ilan'?'İlan: ':'Portföy: ')+(a.baslik||a.ilan_no||'-'))}</option>`).join('')}</select></div><div class="field"><label>Min Skor</label><input id="minScore" value="30"></div><button class="btn" onclick="runAssetMatch()">Bu ilana alıcı bul</button></div><div id="matchResults"></div></div>`; }
window.runAssetMatch=()=>{ const v=$('matchAsset').value; const min=num($('minScore').value)||0; if(!v){$('matchResults').innerHTML='<p class="notice">Önce portföy/ilan seç.</p>';return} const [type,id]=v.split(':'); const asset=(type==='ilan'?cache.ilanlar:cache.portfoyler).find(x=>x.id===id); if(!asset){$('matchResults').innerHTML='<p class="notice">Kayıt bulunamadı.</p>';return} const rows=cache.kisiler.filter(k=>/alici|ikisi/.test(norm(k.tip))).map(k=>({k,a:asset,m:scoreMatch(k,asset)})).filter(x=>x.m.score>=min).sort((a,b)=>b.m.score-a.m.score); $('matchResults').innerHTML=rows.length?matchTable(rows):'<p class="muted">Eşleşme bulunamadı. Min skoru düşür veya kriterleri kontrol et.</p>'; };


function allMessageContacts(){ return cache.kisiler.filter(k=>normalizePhoneForSave(k.telefon)); }
function allMessageAssets(){ return [...cache.portfoyler.map(x=>({...x,_type:'portfoy'})), ...cache.ilanlar.map(x=>({...x,_type:'ilan'}))]; }
function assetLabel(a){ return [a.baslik||a.ilan_no||'Portföy/İlan', a.sehir, a.ilce, a.mahalle, money(estatePrice(a))].filter(Boolean).join(' / '); }
function renderMesajlar(){
  const contacts=allMessageContacts(); const assets=allMessageAssets();
  $('mesajlar').innerHTML=`<div class="card"><h3>📣 WhatsApp Toplu Hazırlama</h3>
  <div class="notice">Bu bölüm otomatik mesaj göndermez. Seçtiğin kişilere tek tek WhatsApp bağlantısı hazırlar; gönderme kararını sen verirsin.</div>
  <div class="row"><div class="field"><label>İlan / Portföy seç</label><select id="msgAsset"><option value="">İlan seçmeden genel mesaj</option>${assets.map(a=>`<option value="${a._type}:${a.id}">${esc(assetLabel(a))}</option>`).join('')}</select></div>
  <div class="field"><label>Mesaj Metni</label><textarea id="msgText" placeholder="Merhaba, size uygun olabileceğini düşündüğüm bir portföy var. Detayları paylaşmak isterim."></textarea></div></div>
  <div class="row"><button class="btn secondary" onclick="fillDefaultMessage()">İlan Bilgisiyle Mesaj Hazırla</button><button class="btn" onclick="toggleAllMsgContacts(true)">Tümünü Seç</button><button class="btn" onclick="toggleAllMsgContacts(false)">Seçimi Temizle</button><button class="btn primary" onclick="prepareBulkWhatsApp()">Seçilenlere WhatsApp Linki Hazırla</button></div>
  <h4>Kişi Seç</h4><div class="checks msg-list">${contacts.length?contacts.map(k=>`<label><input type="checkbox" class="msgContact" value="${k.id}"> ${esc(k.ad_soyad||'-')} · ${esc(formatTRPhone(k.telefon))}</label>`).join(''):'<span class="muted">Telefonu kayıtlı kişi yok.</span>'}</div>
  <div id="msgResults" style="margin-top:12px"></div></div>`;
}
window.toggleAllMsgContacts=(on)=>document.querySelectorAll('.msgContact').forEach(x=>x.checked=!!on);
function getSelectedMsgAsset(){ const v=$('msgAsset')?.value||''; if(!v) return null; const [type,id]=v.split(':'); return (type==='ilan'?cache.ilanlar:cache.portfoyler).find(x=>x.id===id) || null; }
window.fillDefaultMessage=()=>{
  const a=getSelectedMsgAsset();
  let txt='Merhaba, size uygun olabileceğini düşündüğüm bir portföy var. Detayları paylaşmak isterim.';
  if(a){ txt=`Merhaba, aradığınız kritere uygun olabilecek bir portföy var:\n${a.baslik||'İlan'}\nKonum: ${[a.sehir,a.ilce,a.mahalle].filter(Boolean).join(' / ')}\nFiyat: ${money(estatePrice(a))}\nDetayları paylaşmamı ister misiniz?`; }
  $('msgText').value=txt;
};
window.prepareBulkWhatsApp=()=>{
  const ids=[...document.querySelectorAll('.msgContact:checked')].map(x=>x.value);
  const people=cache.kisiler.filter(k=>ids.includes(k.id));
  const text=($('msgText')?.value||'Merhaba, uygun bir portföy hakkında bilgi paylaşmak isterim.').trim();
  if(!people.length){ $('msgResults').innerHTML='<p class="notice">Önce en az bir kişi seç.</p>'; return; }
  $('msgResults').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Kişi</th><th>Telefon</th><th>İşlem</th></tr></thead><tbody>${people.map(k=>{ const w=waTextLink(k.telefon,text); const c=callLink(k.telefon); return `<tr><td>${esc(k.ad_soyad||'-')}</td><td>${esc(formatTRPhone(k.telefon))}</td><td><a class="wa" target="_blank" href="${w}">💬 WhatsApp Aç</a> ${c?`<a class="call" href="${c}">📞 Direkt Ara</a>`:''}</td></tr>` }).join('')}</tbody></table></div>`;
};


function allAssets(){ return [...cache.portfoyler.map(x=>({...x,_type:'portfoy'})), ...cache.ilanlar.map(x=>({...x,_type:'ilan'}))]; }
function assetPhone(a){ return a.telefon || a.satici_telefon || ''; }
function assetTitle(a){ return a.baslik || a.ilan_no || 'Portföy/İlan'; }
function assetPhoto(a){ const photos=photoMetas(a); const p=(photos[0]?.url || parseFirstPhoto(a.foto_urls) || ''); return p; }

function slugTR(v){
  return String(v||'').trim().toLocaleLowerCase('tr-TR')
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/İ/g,'i').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function categorySlug(tur,islem,oda){
  const tg=typeGroup(tur); const tt=transType(islem);
  if(tg==='konut'){
    // Müşteri arama asistanında konut için en pratik sonuç sayfası daire kategorisi.
    // Villa/müstakil gibi özel arama istenirse kelime arama yedek linkinde zaten aranır.
    return tt==='kiralik' ? 'kiralik-daire' : 'satilik-daire';
  }
  if(tg==='isyeri'){
    if(tt==='kiralik') return 'kiralik-isyeri';
    if(tt==='devren-kiralik') return 'devren-kiralik-isyeri';
    if(tt==='devren-satilik') return 'devren-satilik-isyeri';
    return 'satilik-isyeri';
  }
  if(tg==='arsa'){
    if(tt==='kiralik') return 'kiralik-arsa';
    if(tt==='kat-karsiligi') return 'kat-karsiligi-arsa';
    return 'satilik-arsa';
  }
  return tt==='kiralik' ? 'kiralik-daire' : 'satilik-daire';
}
function buildQueryParams(obj){
  const ps=[];
  Object.entries(obj).forEach(([k,v])=>{ if(v!==undefined && v!==null && String(v).trim()!=='') ps.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v))); });
  return ps.length ? '?' + ps.join('&') : '';
}
function sahibindenSearchLinks(c){
  const cat=categorySlug(c.tur,c.islem,c.oda);
  const city=slugTR(c.sehir);
  const district=slugTR(c.ilce);
  const mahalle=String(c.mahalle||'').replace(/mah\.?|mahallesi/ig,'').trim();
  const oda=String(c.oda||'').trim();
  const path = city && district ? `${city}-${district}` : (city || '');
  const min=num(c.min), max=num(c.max);
  const priceParams={};
  if(min) priceParams.price_min=min;
  if(max) priceParams.price_max=max;
  priceParams.sorting='date_desc';

  // Sahibinden URL'lerinde mahalle/oda bilgisini query_text'e gömmek bazı durumlarda sonucu tamamen sıfırlıyor.
  // Bu yüzden ilk link geniş ilçe linkidir; kullanıcı Sahibinden içindeki sol filtrelerle oda/mahalle daraltır.
  const districtWide='https://www.sahibinden.com/' + cat + (path?('/'+path):'') + buildQueryParams({sorting:'date_desc'});
  const districtPrice='https://www.sahibinden.com/' + cat + (path?('/'+path):'') + buildQueryParams(priceParams);

  const cityWide='https://www.sahibinden.com/' + cat + (city?('/'+city):'') + buildQueryParams({sorting:'date_desc'});

  const qExact=[c.islem,c.tur,c.sehir,c.ilce,mahalle,oda,min?String(min):'',max?String(max):''].filter(Boolean).join(' ');
  const qLoose=[c.islem,c.tur,c.sehir,c.ilce,mahalle,oda].filter(Boolean).join(' ');
  const qVeryLoose=[c.islem,c.tur,c.sehir,c.ilce].filter(Boolean).join(' ');

  const keywordExact='https://www.sahibinden.com/kelime-ile-arama?query=' + encodeURIComponent(qExact);
  const keywordLoose='https://www.sahibinden.com/kelime-ile-arama?query=' + encodeURIComponent(qLoose);
  const general='https://www.sahibinden.com/arama?query=' + encodeURIComponent(qVeryLoose);

  return [
    {label:'1) İlçe Kategori Linki - En Sağlam', url:districtWide, note:'Önce bunu aç. Sonra Sahibinden içinde fiyat, oda ve mahalle filtresini elle seç. Boş sonuç riskini en çok azaltan link budur.'},
    {label:'2) İlçe + Fiyat Linki', url:districtPrice, note:'Bütçe aralığını da ekler. Sonuç boşsa 1. linke dön.'},
    {label:'3) İl Geneli Yedek Link', url:cityWide, note:'İlçe linki Sahibinden tarafında sonuç vermezse il geneline çıkar.'},
    {label:'4) Kelime Araması - Detaylı', url:keywordExact, note:'Kriterlerin tamamını kelime olarak arar; bazen çok dar olduğu için boş dönebilir.'},
    {label:'5) Kelime Araması - Geniş', url:keywordLoose, note:'Fiyat olmadan arar; daha çok sonuç getirir.'},
    {label:'6) Genel Arama Yedeği', url:general, note:'Son yedek link.'},
  ];
}
function sahibindenSearchUrl(q){ return 'https://www.sahibinden.com/kelime-ile-arama?query=' + encodeURIComponent(q); }

function filterAssetsByCriteria(c){
  const min=num(c.min), max=num(c.max); const tg=typeGroup(c.tur); const tt=transType(c.islem); const oda=norm(c.oda); const sehir=norm(c.sehir); const ilce=norm(c.ilce); const mahalle=norm(c.mahalle);
  return allAssets().map(a=>{
    let score=0, reasons=[]; const price=estatePrice(a);
    if(tg && typeGroup(a.tur||a.kategori||a.baslik)===tg){score+=25; reasons.push('tür');}
    if(tt && transType(a.islem_tipi||a.baslik)===tt){score+=20; reasons.push('işlem');}
    if(sehir && norm(a.sehir)===sehir){score+=10; reasons.push('şehir');}
    if(ilce && norm(a.ilce)===ilce){score+=20; reasons.push('ilçe');}
    if(mahalle && norm(a.mahalle).includes(mahalle.replace(/ mah\.?/,'').trim())){score+=20; reasons.push('mahalle');}
    if(oda && norm(a.oda)===oda){score+=15; reasons.push('oda');}
    if(price && (!min || price>=min) && (!max || price<=max)){score+=20; reasons.push('bütçe');}
    else if(price && max && price<=max*1.15){score+=8; reasons.push('bütçeye yakın');}
    return {a, score:Math.min(score,100), reasons};
  }).filter(x=>x.score>=25).sort((x,y)=>y.score-x.score);
}

window.copyText=async(t)=>{ try{ await navigator.clipboard.writeText(t); alert('Link kopyalandı'); }catch(e){ prompt('Linki kopyala:', t); } };

function renderAssetCards(rows){
  if(!rows.length) return '<p class="muted">CRM içinde uygun kayıt bulunamadı. Sahibinden arama linkinden manuel kontrol edip uygun ilanları eklentiyle arşive alabilirsin.</p>';
  return `<div class="cards-list">${rows.map(x=>{const a=x.a; const p=assetPhoto(a); const c=commission(a); return `<div class="result-card"><div>${p?`<img class="result-img" src="${esc(p)}">`:''}</div><div><b>${esc(assetTitle(a))}</b><br><span class="muted">${esc([a.tur,a.islem_tipi,a.sehir,a.ilce,a.mahalle,a.oda].filter(Boolean).join(' / '))}</span><br><b>${money(estatePrice(a))}</b><br>${compHtml(a)}<br><span class="muted">Skor: ${x.score} · ${esc(x.reasons.join(', '))}</span><br><span class="muted">${esc(c.text)}</span></div><div class="actions-stack">${a.url?`<a class="btn small" target="_blank" href="${esc(a.url)}">İlana git</a>`:''}${contactActions(assetPhone(a))}</div></div>`}).join('')}</div>`;
}
function renderAramaAsistani(){
  $('arama').innerHTML=`<div class="card"><h3>🔎 Müşteri Arama Asistanı</h3><div class="notice">Bu ekran Sahibinden'i otomatik taramaz. CRM içindeki portföy/ilan arşivini eşleştirir ve Sahibinden için sağlam arama bağlantıları hazırlar. İlk bağlantı özellikle geniş tutulur; site içinde oda/mahalle/fiyatı elle daraltabilirsin.</div>
  <div class="row"><div class="field"><label>Tür</label><select id="ara_tur"><option>Konut</option><option>İş Yeri</option><option>Arsa</option></select></div><div class="field"><label>İşlem</label><select id="ara_islem"><option>Kiralık</option><option>Satılık</option><option>Devren Kiralık</option><option>Devren Satılık</option></select></div>${odaField('ara',ODA_KISI)}</div>
  ${locationFields('ara')}
  <div class="row">${moneyField('ara_min','Bütçe Min')}${moneyField('ara_max','Bütçe Max')}<div class="field"><label>Müşteri Notu</label><input id="ara_musteri" placeholder="Örn: Ahmet Bey telefonda aradı"></div></div>
  <div class="row"><button class="btn primary" onclick="runCustomerSearch()">Uygunları Önüme Getir</button><button class="btn secondary" onclick="saveSearchAsCustomer()">Bu Kriterle Kişi Oluştur</button></div><div id="aramaResults" style="margin-top:12px"></div></div>`;
}
window.runCustomerSearch=()=>{
  const oda=val('ara_oda')==='Diğer'?val('ara_oda_diger'):val('ara_oda');
  const c={tur:val('ara_tur'),islem:val('ara_islem'),sehir:val('ara_sehir'),ilce:val('ara_ilce'),mahalle:val('ara_mahalle'),oda,min:valNum('ara_min'),max:valNum('ara_max')};
  const rows=filterAssetsByCriteria(c);
  const links=sahibindenSearchLinks(c);
  const linkHtml=links.map((l,i)=>`<div class="result-card"><div><b>${i+1}. ${esc(l.label)}</b><br><span class="muted">${esc(l.note)}</span><br><span class="muted small-url">${esc(l.url)}</span></div><div class="actions-stack"><a class="btn ${i===0?'primary':'secondary'}" target="_blank" href="${esc(l.url)}">Aç</a><button class="btn small" onclick="copyText('${esc(l.url).replace(/'/g,"\\'")}')">Linki Kopyala</button></div></div>`).join('');
  $('aramaResults').innerHTML=`<div class="grid"><div class="card"><b>${rows.length}</b><br><span class="muted">CRM içi uygun kayıt</span></div><div class="card"><b>${allAssets().length}</b><br><span class="muted">Toplam portföy/ilan</span></div></div><div class="card" style="margin-top:12px"><h4>Sahibinden hazır arama</h4><p class="muted">Aşağıdaki bağlantılar ilanları otomatik çekmez; kriterlerine göre Sahibinden sonuç sayfasını açar. İlk link geniş ilçe linkidir. Boş çıkarsa ikinci/üçüncü yedek linkleri dene; Sahibinden içinde fiyat/oda/mahalle filtresini elle daralt.</p>${linkHtml}</div><div class="card" style="margin-top:12px"><h4>CRM içinde uygun kayıtlar</h4>${renderAssetCards(rows)}</div>`;
};
window.saveSearchAsCustomer=async()=>{
  const name=val('ara_musteri')||'Yeni müşteri araması'; const oda=val('ara_oda')==='Diğer'?val('ara_oda_diger'):val('ara_oda');
  await upsert('kisiler',{tip:'Alıcı',ad_soyad:name,aranan_tur:val('ara_tur'),islem_tipi:val('ara_islem'),sehir:val('ara_sehir'),ilce:val('ara_ilce'),mahalle:val('ara_mahalle'),oda,butce_min:valNum('ara_min'),butce_max:valNum('ara_max'),notlar:'Müşteri Arama Asistanı üzerinden oluşturuldu.'});
};

let mahalleMap=null, mahalleLayer=null;
let mahalleMapRendered=false;
function renderMahalleTakibi(){
  // Harita daha önce gizli sekmede oluşturulduysa siyah/boş kalabiliyordu.
  // Bölüm yeniden çizilirken eski Leaflet nesnesini temizleyip kullanıcı butonuyla kuruyoruz.
  try{ if(mahalleMap && mahalleMap.remove) mahalleMap.remove(); }catch(e){}
  mahalleMap=null; mahalleLayer=null; mahalleMapRendered=false;
  $('mahalle').innerHTML=`<div class="card"><h3>🗺️ Mahalle Takibi</h3><div class="notice">Harita, CRM'e kaydettiğin portföyler ve ilan arşivindeki kayıtları gösterir. Sahibinden'deki tüm ilanları otomatik çekmez. Ekran siyah/boş kalırsa "Haritayı Yenile" butonuna bas.</div><div class="row"><button class="btn primary" onclick="initMahalleMap(true)">Konumuma Göre Haritayı Aç</button><button class="btn" onclick="plotMahalleAssets()">İlanları Haritada Göster</button><button class="btn secondary" onclick="fitMapToAssets()">Haritayı İlanlara Yaklaştır</button><button class="btn" onclick="refreshMahalleMap()">Haritayı Yenile</button></div><div id="mapStatus" class="muted">Haritayı açmak için butona bas.</div><div id="mahalleMap" class="mapbox"></div><div id="mapListFallback" style="margin-top:12px"></div><div class="card" style="margin-top:12px"><h4>Harita verisi</h4><div class="muted">${allAssets().length} kayıt haritaya yerleştirilmeye çalışılacak. Konumu hatalı görünen eski kayıtlar, konum metninden otomatik düzeltilmeye çalışılır. Yeni kayıtlar eklenti V12.10 ile daha doğru gelir.</div></div></div>`;
}
function fallbackCenter(){ return [41.390,41.420]; }
async function ensureLeafletLoaded(){
  if(window.L) return true;
  const status=$('mapStatus'); if(status) status.textContent='Harita kütüphanesi yükleniyor...';
  try{
    if(!document.querySelector('link[data-leaflet-fallback]')){
      const css=document.createElement('link'); css.rel='stylesheet'; css.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; css.setAttribute('data-leaflet-fallback','1'); document.head.appendChild(css);
    }
    await new Promise((resolve,reject)=>{
      const sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; sc.async=true; sc.onload=resolve; sc.onerror=reject; document.head.appendChild(sc);
      setTimeout(()=>window.L?resolve():reject(new Error('Leaflet yüklenemedi')),9000);
    });
  }catch(e){
    if(status) status.textContent='Harita kütüphanesi yüklenemedi. İnternet bağlantısını kontrol et veya sayfayı yenile.';
    renderMapListFallback();
    return false;
  }
  return !!window.L;
}
function locKey(a){ return [a.sehir,a.ilce,a.mahalle].filter(Boolean).join(' / ') || 'Artvin Hopa'; }
function localCoordFor(a){
  const key=norm(locKey(a));
  const known=[
    [/hopa.*sundura/,[41.399,41.424]],[/hopa.*ortahopa/,[41.390,41.418]],[/hopa/,[41.390,41.418]],
    [/arhavi/,[41.351,41.304]],[/kemalpasa/,[41.486,41.528]],[/artvin/,[41.182,41.819]],
    [/rize/,[41.025,40.517]],[/trabzon/,[41.005,39.730]]
  ];
  const f=known.find(([re])=>re.test(key)); return f?f[1]:null;
}
async function geocodeAsset(a){
  const key='geo_'+norm(locKey(a));
  try{ const cached=JSON.parse(localStorage.getItem(key)||'null'); if(cached) return cached; }catch{}
  const local=localCoordFor(a); if(local){ localStorage.setItem(key,JSON.stringify(local)); return local; }
  try{
    const q=[a.mahalle,a.ilce,a.sehir,'Türkiye'].filter(Boolean).join(', ');
    const res=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q));
    const data=await res.json();
    if(data && data[0]){ const pos=[Number(data[0].lat),Number(data[0].lon)]; localStorage.setItem(key,JSON.stringify(pos)); return pos; }
  }catch(e){}
  return fallbackCenter();
}
window.initMahalleMap=async(ask=true)=>{
  const status=$('mapStatus');
  const box=$('mahalleMap');
  if(!box){ return; }
  box.style.display='block';
  box.style.minHeight = window.innerWidth < 800 ? '70vh' : '520px';
  box.innerHTML='';
  if(!(await ensureLeafletLoaded())) return;
  if(mahalleMap){ try{ mahalleMap.invalidateSize(true); }catch(e){} return; }
  try{
    mahalleMap=L.map('mahalleMap',{zoomControl:true,preferCanvas:true}).setView(fallbackCenter(),13);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'© OpenStreetMap'});
    tiles.on('tileerror',()=>{ if(status) status.textContent='Harita karoları yüklenemedi. Bağlantı yavaşsa birkaç saniye bekle veya Haritayı Yenile de.'; });
    tiles.addTo(mahalleMap);
    mahalleLayer=L.layerGroup().addTo(mahalleMap);
    mahalleMapRendered=true;
    setTimeout(()=>{ try{ mahalleMap.invalidateSize(true); }catch(e){} },250);
    setTimeout(()=>{ try{ mahalleMap.invalidateSize(true); }catch(e){} },900);
    if(status) status.textContent='Harita hazır. İlanlar yerleştiriliyor...';
    if(ask && navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos=>{ const p=[pos.coords.latitude,pos.coords.longitude]; mahalleMap.setView(p,14); L.circleMarker(p,{radius:8}).addTo(mahalleMap).bindPopup('Şu anki konumun'); plotMahalleAssets(); },()=>plotMahalleAssets(),{enableHighAccuracy:true,timeout:7000});
    } else plotMahalleAssets();
  }catch(e){
    if(status) status.textContent='Harita başlatılamadı: '+(e.message||e);
    renderMapListFallback();
  }
};
window.refreshMahalleMap=()=>{
  try{ if(mahalleMap && mahalleMap.remove) mahalleMap.remove(); }catch(e){}
  mahalleMap=null; mahalleLayer=null;
  initMahalleMap(false);
};
function markerPopup(a){ const p=assetPhoto(a); const phone=assetPhone(a); const foto=p?`<img src="${esc(p)}" style="width:170px;height:95px;object-fit:cover;border-radius:10px;margin-bottom:6px">`:''; return `<div class="map-popup">${foto}<b>${esc(assetTitle(a))}</b><br><span>${esc([a.islem_tipi,a.tur,a.sehir,a.ilce,a.mahalle].filter(Boolean).join(' / '))}</span><br><b>${money(estatePrice(a))}</b><br>${a.url?`<a target="_blank" href="${esc(a.url)}">İlana git</a><br>`:''}${phone?`${waHtml(phone)} ${callHtml(phone)}`:''}</div>`; }
function renderMapListFallback(){
  const el=$('mapListFallback'); if(!el) return;
  const rows=allAssets().filter(a=>a.sehir||a.ilce||a.mahalle).slice(0,30);
  el.innerHTML = `<div class="card"><h4>Harita açılamazsa liste görünümü</h4>${renderAssetCards(rows)}</div>`;
}
window.plotMahalleAssets=async()=>{
  if(!mahalleMap){ await initMahalleMap(false); }
  if(!mahalleLayer){ renderMapListFallback(); return; }
  mahalleLayer.clearLayers();
  const assets=allAssets().filter(a=>a.sehir||a.ilce||a.mahalle);
  const status=$('mapStatus');
  if(status) status.textContent=`${assets.length} kayıt haritaya yerleştiriliyor...`;
  for(const a of assets){
    const pos=await geocodeAsset(a);
    const seed=Math.abs(String(a.id||a.baslik||'').split('').reduce((t,ch)=>t+ch.charCodeAt(0),0));
    const offLat=((seed%7)-3)*0.00035, offLng=(((seed/7)|0)%7-3)*0.00035;
    L.marker([pos[0]+offLat,pos[1]+offLng]).addTo(mahalleLayer).bindPopup(markerPopup(a));
  }
  if(status) status.textContent=`${assets.length} kayıt haritada gösterildi.`;
  try{ mahalleMap.invalidateSize(true); }catch(e){}
  if(assets.length) fitMapToAssets();
};
window.fitMapToAssets=()=>{ if(!mahalleLayer || !mahalleMap) return; const layers=mahalleLayer.getLayers(); if(!layers.length) return; mahalleMap.fitBounds(L.featureGroup(layers).getBounds().pad(.25)); };

function renderGorevler(){ $('gorevler').innerHTML=`<div class="two"><div class="card"><h3>Görev Ekle</h3><div class="field"><label>Başlık</label><input id="gorev_baslik"></div><div class="field"><label>Tarih</label><input id="gorev_tarih" type="date"></div><div class="field"><label>Açıklama</label><textarea id="gorev_aciklama"></textarea></div><button class="btn" onclick="saveGorev()">Kaydet</button></div><div class="card"><h3>Görevler</h3>${tableGorev()}</div></div>`; }
window.saveGorev=()=>upsert('gorevler',{baslik:val('gorev_baslik'),tarih:val('gorev_tarih')||null,aciklama:val('gorev_aciklama')});
function tableGorev(){ return `<table class="table"><thead><tr><th>Görev</th><th>Tarih</th><th>Durum</th><th></th></tr></thead><tbody>${cache.gorevler.map(g=>`<tr><td>${esc(g.baslik)}<br><span class="muted">${esc(g.aciklama||'')}</span></td><td>${esc(g.tarih||'-')}</td><td>${esc(g.durum||'')}</td><td><button class="btn small danger" onclick="del('gorevler','${g.id}')">Sil</button></td></tr>`).join('')}</tbody></table>` }
function renderAyarlar(){ const c=getEffectiveConfig(); $('ayarlar').innerHTML=`<div class="card"><h3>Ayarlar</h3><p><b>Kullanıcı:</b> ${esc(currentUser?.email)}</p><p class="muted">Bu panel Supabase RLS ile çalışır. Kayıtlar user_id üzerinden ayrılır.</p><div class="notice">V12.4/V12.5 kullanmadan önce Supabase SQL Editor içinde <b>V12_4_SUPABASE_GUNCELLE.sql</b> dosyasını çalıştır.</div><p><b>Supabase URL:</b> ${esc(c.SUPABASE_URL||'-')}</p><button class="btn secondary" onclick="loadAll()">Verileri Yenile</button> <button class="btn danger" onclick="localStorage.removeItem('emlak_crm_supabase_config'); alert('Ayar temizlendi. Sayfayı yenile.');">Tarayıcıdaki Supabase Ayarını Temizle</button></div>`; }

$('loginBtn').onclick=async()=>{ if(!refreshSupabaseClient()) return alert('Supabase ayarı eksik. Üstteki Supabase Ayarı kutusunu doldurup kaydet.'); const {error}=await sb.auth.signInWithPassword({email:$('loginEmail').value,password:$('loginPass').value}); $('loginMsg').textContent=error?error.message:'Giriş yapıldı'; };
$('signupBtn').onclick=async()=>{ if(!refreshSupabaseClient()) return alert('Supabase ayarı eksik. Üstteki Supabase Ayarı kutusunu doldurup kaydet.'); const {error}=await sb.auth.signUp({email:$('loginEmail').value,password:$('loginPass').value}); $('loginMsg').textContent=error?error.message:'Kayıt oluşturuldu. Mail onayı açıksa e-postanı kontrol et.'; };
$('logoutBtn').onclick=async()=>{ if(sb) await sb.auth.signOut(); };
window.del=del;
authInit();
