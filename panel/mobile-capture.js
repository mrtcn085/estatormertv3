(function(){
  function clean(s){return (s||'').replace(/\s+/g,' ').trim();}
  function norm(s){return String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').trim();}
  function first(selectors){for(const sel of selectors){const el=document.querySelector(sel); if(el&&clean(el.innerText||el.textContent))return clean(el.innerText||el.textContent); if(el&&el.getAttribute&&clean(el.getAttribute('content')))return clean(el.getAttribute('content'));}return '';}
  function allTexts(selectors){const out=[]; selectors.forEach(sel=>document.querySelectorAll(sel).forEach(el=>{const t=clean(el.innerText||el.textContent||el.getAttribute('content')||''); if(t)out.push(t)})); return out;}
  const text=document.body.innerText||'';
  const lines=text.split(/\n|\r/).map(clean).filter(Boolean);
  function findAfter(label){const ll=label.toLocaleLowerCase('tr-TR'); const i=lines.findIndex(x=>x.toLocaleLowerCase('tr-TR')===ll); if(i>=0&&lines[i+1])return lines[i+1]; const same=lines.find(x=>x.toLocaleLowerCase('tr-TR').startsWith(ll+' ')); return same?clean(same.slice(label.length)):'';}
  const ILCE_MAP={
    'Artvin':['Merkez','Ardanuç','Arhavi','Borçka','Hopa','Kemalpaşa','Murgul','Şavşat','Yusufeli'],
    'Rize':['Merkez','Ardeşen','Çamlıhemşin','Çayeli','Derepazarı','Fındıklı','Güneysu','Hemşin','İkizdere','İyidere','Kalkandere','Pazar'],
    'Trabzon':['Merkez','Akçaabat','Araklı','Arsin','Beşikdüzü','Çarşıbaşı','Çaykara','Dernekpazarı','Düzköy','Hayrat','Köprübaşı','Maçka','Of','Ortahisar','Sürmene','Şalpazarı','Tonya','Vakfıkebir','Yomra'],
    'İstanbul':['Adalar','Arnavutköy','Ataşehir','Avcılar','Bağcılar','Bahçelievler','Bakırköy','Başakşehir','Beşiktaş','Beykoz','Beylikdüzü','Beyoğlu','Büyükçekmece','Çekmeköy','Esenler','Esenyurt','Eyüpsultan','Fatih','Gaziosmanpaşa','Güngören','Kadıköy','Kağıthane','Kartal','Küçükçekmece','Maltepe','Pendik','Sancaktepe','Sarıyer','Silivri','Sultanbeyli','Sultangazi','Şile','Şişli','Tuzla','Ümraniye','Üsküdar','Zeytinburnu'],
    'Ankara':['Altındağ','Çankaya','Etimesgut','Keçiören','Mamak','Pursaklar','Sincan','Yenimahalle','Gölbaşı'],
    'İzmir':['Balçova','Bayraklı','Bornova','Buca','Çeşme','Çiğli','Gaziemir','Karabağlar','Karşıyaka','Konak','Menemen','Narlıdere','Torbalı','Urla']
  };
  function unique(a){return [...new Set(a.map(clean).filter(Boolean))];}
  function badLoc(x){return !x||x.length>80||/emlak|konut|arsa|iş yeri|isyeri|satılık|satilik|kiralık|kiralik|ilan|favori|arama|kategori|sahibinden|vitrin|detay|fotoğraf|video|harita|tl|m²|oda/i.test(x)||/^\d+$/.test(x);}
  function tokensFrom(txt){return unique(String(txt||'').split(/\n|\r|\/|>|›|»|,|\|/).map(x=>clean(x.replace(/^[•\-–]+/,''))).filter(x=>!badLoc(x)));}
  function findLocationInText(txt){
    const nt=norm(String(txt||'')); const toks=tokensFrom(txt); const cand=[];
    for(const [sehir,ilceler] of Object.entries(ILCE_MAP)){
      const sIdx=nt.indexOf(norm(sehir)); if(sIdx<0) continue;
      for(const ilce of ilceler){ const iIdx=nt.indexOf(norm(ilce)); if(iIdx<0) continue; cand.push({sehir,ilce,score:(ilce==='Merkez'?50:0)+Math.abs(iIdx-sIdx)}); }
    }
    if(!cand.length) return null; cand.sort((a,b)=>a.score-b.score); const best=cand[0];
    let mahalle=''; const idx=toks.findIndex(x=>norm(x)===norm(best.ilce));
    if(idx>=0){ for(let j=idx+1;j<Math.min(toks.length,idx+5);j++){ const x=toks[j]; if(!Object.keys(ILCE_MAP).some(p=>norm(p)===norm(x))&&!ILCE_MAP[best.sehir].some(d=>norm(d)===norm(x))&&!badLoc(x)){ mahalle=x; break; } } }
    return {sehir:best.sehir,ilce:best.ilce,mahalle};
  }
  function extractLocation(){
    const parts=[...allTexts(['.classifiedLocation','[class*="classifiedLocation"]','.classifiedBreadCrumb a','.classifiedBreadcrumb a','.breadcrumb a','nav a','meta[property="og:description"]']), first(['.classifiedLocation','[class*="classifiedLocation"]'])];
    for(const p of parts){ const loc=findLocationInText(p); if(loc&&loc.sehir&&loc.ilce) return {...loc,konum:clean(p)}; }
    const bodyLoc=findLocationInText(lines.slice(0,100).join('\n'))||findLocationInText(text);
    return bodyLoc?{...bodyLoc,konum:[bodyLoc.sehir,bodyLoc.ilce,bodyLoc.mahalle].filter(Boolean).join(' / ')}:{sehir:'',ilce:'',mahalle:'',konum:''};
  }
  function toNum(s){const n=Number(String(s||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.')); return Number.isFinite(n)?n:null;}
  const baslik=first(['h1','meta[property="og:title"]'])||document.title;
  const priceText=first(['.classifiedInfo h3','.classifiedPrice','[class*=price]'])||(text.match(/[0-9\.\,\s]{4,}\s*TL/i)?.[0]||'');
  const ilan_no=findAfter('İlan No') || (location.href.match(/-(\d{7,})\/?$/)?.[1]||'');
  const tur=findAfter('Emlak Tipi')||findAfter('Konut Tipi')||findAfter('İşyeri Tipi')||(baslik.match(/arsa|tarla/i)?'Arsa':baslik.match(/dükkan|dukkan|iş yeri|isyeri|ofis/i)?'İş Yeri':'Konut');
  const islem=baslik.match(/devren.*kiralık|devren.*kiralik/i)?'Devren Kiralık':baslik.match(/devren.*satılık|devren.*satilik/i)?'Devren Satılık':baslik.match(/kiralık|kiralik/i)?'Kiralık':'Satılık';
  const loc=extractLocation();
  const phoneRegex=/(?:\+90|0090|0)?\s*\(?\s*(?:5\d{2}|[2-4]\d{2})\s*\)?[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/g;
  const telefon=(text.match(phoneRegex)||[]).slice(0,2).join(', ');
  let ad='';
  for(let i=0;i<lines.length;i++){
    if(/hesap açma tarihi|hesap acma tarihi/i.test(lines[i])){
      for(let j=i-1;j>=Math.max(0,i-6);j--){
        const c=clean(lines[j].replace(phoneRegex,''));
        if(/^[A-ZÇĞİÖŞÜa-zçğıöşü .'-]{2,70}$/.test(c)&&!/cep|telefon|ilan|satılık|kiralık|tl|emlak|favori|yazdır|mesaj/i.test(c)){ad=c;break;}
      }
      if(ad) break;
    }
  }
  const raw=[]; document.querySelectorAll('img').forEach(img=>[img.currentSrc,img.src,img.getAttribute('data-src'),img.getAttribute('data-original'),img.getAttribute('data-lazy')].forEach(u=>{if(u)raw.push(u)}));
  const foto_urls=unique(raw.map(u=>{try{return new URL(u,location.href).href}catch{return''}}).filter(u=>/^https?:/.test(u)&&!/logo|sprite|icon|avatar|map|blank|loading/i.test(u)&&/(sahibinden|shbdn|jpg|jpeg|png|webp|image|photo)/i.test(u))).slice(0,30);
  function pageCoord(){
    const html=document.documentElement.innerHTML||'';
    const latMeta=document.querySelector('meta[property="place:location:latitude"],meta[name="latitude"]')?.getAttribute('content');
    const lngMeta=document.querySelector('meta[property="place:location:longitude"],meta[name="longitude"]')?.getAttribute('content');
    const lat=Number(String(latMeta||'').replace(',','.')), lng=Number(String(lngMeta||'').replace(',','.'));
    if(Number.isFinite(lat)&&Number.isFinite(lng)) return {map_lat:lat,map_lng:lng,map_source:'page_meta'};
    const regs=[/["']lat(?:itude)?["']\s*[:=]\s*([0-9]{1,2}\.[0-9]+)[\s\S]{0,100}?["'](?:lon|lng|longitude)["']\s*[:=]\s*([0-9]{1,2}\.[0-9]+)/i,/["'](?:lon|lng|longitude)["']\s*[:=]\s*([0-9]{1,2}\.[0-9]+)[\s\S]{0,100}?["']lat(?:itude)?["']\s*[:=]\s*([0-9]{1,2}\.[0-9]+)/i];
    for(const re of regs){const m=html.match(re); if(m){let a=Number(m[1]), b=Number(m[2]); if(re===regs[1]) [a,b]=[b,a]; if(Number.isFinite(a)&&Number.isFinite(b)) return {map_lat:a,map_lng:b,map_source:'page_script'};}}
    return {};
  }
  const data={ilan_no,url:location.href,baslik,tur,islem_tipi:islem,fiyat:toNum(priceText),fiyat_text:priceText,sehir:loc.sehir,ilce:loc.ilce,mahalle:loc.mahalle,konum:loc.konum,oda:findAfter('Oda Sayısı'),brut_m2:toNum(findAfter('m² (Brüt)')||findAfter('m²')),net_m2:toNum(findAfter('m² (Net)')),kimden:findAfter('Kimden'),ad_soyad:ad,telefon,aciklama:first(['#classifiedDescription','.classifiedDescription']),foto_urls,...pageCoord()};
  const overlay=document.createElement('div'); overlay.style.cssText='position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;background:#0f172a;color:white;padding:14px;border-radius:14px;font-family:Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:14px'; overlay.innerHTML='<b>PortföyX</b><br>İlan verileri alındı, PortföyX açılıyor...'; document.body.appendChild(overlay);
  const payload=encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
  const origin=new URL(document.currentScript.src).origin;
  const target=origin+'/#px-import='+payload;
  setTimeout(()=>{ window.open(target,'_blank') || (location.href=target); },500);
})();