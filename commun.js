// Code commun à l'espace étudiant (app.js) et à l'espace enseignant (enseignant.js).
(function(){
"use strict";
const SEUIL = 0.8;            // 16/20 (niveaux 1 et 2)
// Exigences par niveau (les mêmes sont vérifiées sur le serveur : fonctions seuil, test_nb_questions, test_duree, examen_duree)
const EXIGENCES = {
  1: {seuil:0.8,  test:80,  testMin:25},
  2: {seuil:0.8,  test:80,  testMin:25},
  3: {seuil:0.85, test:120, testMin:37},
  4: {seuil:0.9,  test:150, testMin:45}
};
const exigence = i => EXIGENCES[i] || EXIGENCES[1];
const sur20 = seuil => String(Math.round(seuil*20)) + "/20";
const examenMin = nbQuestions => nbQuestions > 20 ? 20 : 15;
const MIN_PRATIQUE = 80;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = (a,b) => b ? Math.round(a*100/b) : 0;
const note20 = x => (Math.round((x||0)*200)/10).toLocaleString("fr-FR") + "/20";
const fmtDate = iso => { try{ return new Date(iso).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}); }catch(e){ return ""; } };
const depuis = iso => { if(!iso) return "–"; const j=Math.floor((Date.now()-new Date(iso))/864e5); return j<=0?"aujourd'hui":j===1?"hier":`il y a ${j} jours`; };
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,4200); }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function erreur(e){
  const m = (e && (e.message||e.error_description)) || "Erreur inconnue";
  const fr = {"Invalid login credentials":"Adresse ou mot de passe incorrect.","Email not confirmed":"Ce compte n'est pas encore activé. Contactez le responsable de la formation.","User already registered":"Un compte existe déjà avec cette adresse. Connectez-vous.","Password should be at least 6 characters.":"Le mot de passe doit contenir au moins 6 caractères.",
    "Module inconnu":"Ce module n'est pas encore installé dans la base de données. Le responsable doit exécuter les fichiers SQL de mise à jour (schema_une_commande.sql puis les parties 01 à 03).",
    "Étape inconnue":"Ce module n'est pas encore installé dans la base de données. Prévenez le responsable de la formation."};
  if (/rate limit/i.test(m)) return "Trop d'inscriptions en peu de temps. Réessayez dans une heure. (Responsable : dans Supabase, désactivez « Confirm email » pour que plus aucun e-mail ne soit envoyé à l'inscription.)";
  return fr[m] || m;
}

// Données d'un étudiant à partir de son profil, de ses lignes de progression et de ses tests de passage
function etuDepuis(p, rows, tests){
  const e = {id:p.id, nom:p.nom||"", eglise:p.eglise||"", inscrit:p.inscrit, role:p.role, enseignantId:p.enseignant_id||null,
    identite:{nomNaissance:p.nom_naissance||"", dateNaissance:p.date_naissance||"", lieuNaissance:p.lieu_naissance||"", sexe:p.sexe||"",
      nationalite:p.nationalite||"", telephone:p.telephone||"", pays:p.pays||"", ville:p.ville||""},
    modules:{}, lecons:{}, etapes:{}, evaluations:{}, maj:null, tests:tests||[]};
  for(const r of rows){
    e.modules[r.module_id] = {meilleur:(r.tentatives||r.cert_no) ? Number(r.meilleur) : null, dernier:r.dernier, tentatives:r.tentatives, dateExamen:r.date_examen,
      pratique:r.pratique, pratiqueStatut:r.pratique_statut||null, pratiqueAvis:r.pratique_avis||"", pratiqueDate:r.pratique_date,
      certNo:r.cert_no, certDate:r.cert_date, origine:r.origine||"cours"};
    (r.lecons||[]).forEach(i=>{ e.lecons[r.module_id+"-"+i]=true; });
    for(const [k,v] of Object.entries(r.etapes||{})) e.etapes[r.module_id+"-"+k] = {atteinte:v[0], total:v[1]};
    if(r.note!=null || r.commentaire) e.evaluations[r.module_id] = {note:r.note, commentaire:r.commentaire};
    if(!e.maj || r.maj>e.maj) e.maj = r.maj;
  }
  return e;
}

// Règles de progression (les mêmes sont vérifiées sur le serveur)
function regles(prog){
  const allModules = () => prog.niveaux.flatMap(n=>n.modules.map(m=>({...m, niveau:n})));
  const findModule = id => allModules().find(m=>m.id===id);
  const niveauIndex = n => prog.niveaux.indexOf(n)+1;
  function statut(m, etu){
    const r = (etu.modules||{})[m.id] || {};
    const nb = (m.lecons||[]).length;
    const lus = Array.from({length:nb},(_,i)=>i).filter(i=>(etu.lecons||{})[m.id+"-"+i]).length;
    const ni = m.niveau ? niveauIndex(m.niveau) : prog.niveaux.findIndex(n=>n.modules.some(x=>x.id===m.id))+1;
    const seuil = exigence(ni).seuil;
    return { r, lus, nb, seuil, leconsFinies: lus>=nb, reussi:(r.meilleur||0) >= seuil,
      pratique:(r.pratique||"").trim().length >= MIN_PRATIQUE, certifie:!!r.certNo, valide:!!r.certNo || (r.meilleur||0) >= seuil,
      tentatives:r.tentatives||0, parTest:r.origine==="test", commence: !!(r.tentatives||r.certNo||lus||r.pratique) };
  }
  const niveauFini = (n, etu) => n.modules.every(m=>statut(m,etu).certifie);
  const niveauValide = (n, etu) => n.modules.every(m=>statut(m,etu).valide);
  function niveauOuvert(n, etu){
    const i = prog.niveaux.indexOf(n); if(i===0) return true;
    const prec = prog.niveaux[i-1];
    return niveauValide(prec, etu) || (etu.tests||[]).some(t=>t.reussi && t.niveau===i) || n.modules.some(m=>statut(m,etu).valide);
  }
  function moduleOuvert(m, etu){ const all=allModules(), k=all.findIndex(x=>x.id===m.id); return k===0 || statut(all[k-1], etu).valide; }
  function precedent(m){ const all=allModules(), k=all.findIndex(x=>x.id===m.id); return k>0 ? all[k-1] : null; }
  return {allModules, findModule, niveauIndex, statut, niveauFini, niveauValide, niveauOuvert, moduleOuvert, precedent};
}

// Charge programme.json et la configuration, puis crée le client Supabase
async function connecter(){
  let horsLigne = !navigator.onLine;
  const [prog, cfg] = await Promise.all([fetch("programme.json").then(r=>r.json()), fetch("/api/config", {cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>{ horsLigne=true; return {}; })]);
  if(!cfg.url || !cfg.anonKey || !window.supabase) return {prog, sb:null, horsLigne: horsLigne || !window.supabase};
  return {prog, sb: supabase.createClient(cfg.url, cfg.anonKey)};
}
const CONFIG_MANQUANTE = `<div class="panel" style="display:grid;gap:8px"><h2>Configuration incomplète</h2><p>La plateforme ne trouve pas la connexion à la base de données. Dans Vercel, ajoutez les variables <b>SUPABASE_URL</b> et <b>SUPABASE_ANON_KEY</b>, puis redéployez.</p></div>`;

// Bouton « Afficher / Masquer » des mots de passe
function lierMotsDePasse(racine){
  racine.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ const i=document.getElementById(b.dataset.pw), voir=i.type==="password";
    i.type = voir ? "text" : "password"; b.textContent = voir ? "Masquer" : "Afficher"; b.setAttribute("aria-pressed", String(voir)); i.focus(); });
}

// ---------- Application installable (PWA) ----------
function installation(nomApp){
  if("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(()=>{});
  const boite=document.getElementById("installer"), aide=document.getElementById("aide-install"), sep=document.getElementById("sep-install");
  if(!boite) return;
  const installee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if(installee) return;
  const ua=navigator.userAgent, ios=/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints>1);
  let invite=null;
  const plusTard = () => { try{ return Date.now() < +(localStorage.getItem("hdf-install-plus-tard")||0); }catch(e){ return false; } };
  const fermer = () => { boite.hidden=true; try{ localStorage.setItem("hdf-install-plus-tard", String(Date.now()+7*864e5)); }catch(e){} };
  const PARTAGER = `<svg viewBox="0 0 24 24" width="18" height="18" aria-label="Partager" role="img" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  function afficher(detail){
    boite.hidden=false;
    boite.innerHTML = `<section class="install" aria-label="Installer l'application">
      <img src="${nomApp==="enseignant"?"icones/enseignant-192.png":"icones/etudiant-192.png"}" alt="" width="48" height="48">
      <div class="install-txt"><b>Installez l'application ${nomApp==="enseignant"?"enseignant":"Héro de la Foi"}</b>
        ${invite ? `<span class="hint">Une icône sur votre écran d'accueil, ouverture en plein écran, sans passer par le navigateur.</span>`
        : ios ? `<span class="hint">Sur iPhone ou iPad, dans Safari : touchez ${PARTAGER} <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</span>`
        : `<span class="hint">Android (Chrome) : menu <b>⋮</b> puis <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>. Ordinateur (Chrome ou Edge) : icône d'installation à droite de la barre d'adresse. iPhone : dans Safari, <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.</span>`}</div>
      <div class="row">${invite?`<button class="btn primary" type="button" id="install-ok">Installer</button>`:""}<button class="btn small" type="button" id="install-non">${detail?"Fermer":"Plus tard"}</button></div></section>`;
    const ok=document.getElementById("install-ok"); if(ok) ok.onclick=async()=>{ invite.prompt(); const r=await invite.userChoice; invite=null; if(r.outcome==="accepted"){ boite.hidden=true; toast("Application installée. Retrouvez-la sur votre écran d'accueil."); } else afficher(detail); };
    document.getElementById("install-non").onclick=fermer;
  }
  if(aide){ aide.hidden=false; if(sep) sep.hidden=false; aide.onclick=()=>{ afficher(true); window.scrollTo({top:0,behavior:"smooth"}); }; }
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); invite=e; if(!plusTard()) afficher(false); });
  window.addEventListener("appinstalled", ()=>{ boite.hidden=true; if(aide) aide.hidden=true; if(sep) sep.hidden=true; });
  if(ios && !plusTard()) afficher(false);
}

const HORS_LIGNE = `<div class="panel" style="display:grid;gap:8px"><h2>Vous êtes hors ligne</h2><p>L'application a besoin d'Internet pour vous connecter, enregistrer vos progrès et corriger les examens. Vérifiez votre connexion, puis touchez « Réessayer ».</p><div class="row"><button class="btn primary" type="button" onclick="location.reload()">Réessayer</button></div></div>`;
window.addEventListener("online", ()=>{ if(document.querySelector("#app h2") && /hors ligne/.test(document.querySelector("#app h2").textContent)) location.reload(); });

// Fiche d'identité : obligatoire pour les attestations
const identiteComplete = (e, photo) => !!(e && e.identite && e.identite.nomNaissance.trim().length>=3 && e.identite.dateNaissance && photo);
const dateLongue = d => { if(!d) return ""; const [y,m,j]=String(d).slice(0,10).split("-").map(Number); return new Date(Date.UTC(y,m-1,j)).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); };
const INSTITUTION = {nom:"PRIÈRE EN LIGNE", responsable:"Min. HOUNGBADJI E. Melchisédèk", fonction:"Responsable de la formation", telephone:"(+229) 01 64 01 30 74"};

// ---------- Identifiant de connexion : numéro de téléphone (avec pays) ou e-mail ----------
// Un compte créé avec un numéro reçoit une adresse technique <chiffres>@tel.herodelafoi.invalid :
// aucun SMS ni e-mail n'est envoyé, le numéro sert d'identifiant avec le mot de passe.
const DOMAINE_TEL = "tel.herodelafoi.invalid";
// Exemples de numéros mobiles par pays (libphonenumber-js, examples.mobile.json)
const EXEMPLES_TEL = {"AC":"40123","AD":"312345","AE":"501234567","AF":"701234567","AG":"2684641234","AI":"2642351234","AL":"672123456","AM":"77123456","AO":"923123456","AR":"91123456789","AS":"6847331234","AT":"664123456","AU":"412345678","AW":"5601234","AX":"412345678","AZ":"401234567","BA":"61123456","BB":"2462501234","BD":"1812345678","BE":"450001234","BF":"70123456","BG":"43012345","BH":"36001234","BI":"79561234","BJ":"0195123456","BL":"690001234","BM":"4413701234","BN":"7123456","BO":"71234567","BQ":"3181234","BR":"11961234567","BS":"2423591234","BT":"17123456","BW":"71123456","BY":"294911911","BZ":"6221234","CA":"5062345678","CC":"412345678","CD":"991234567","CF":"70012345","CG":"061234567","CH":"781234567","CI":"0123456789","CK":"71234","CL":"221234567","CM":"671234567","CN":"13123456789","CO":"3211234567","CR":"83123456","CU":"51234567","CV":"9911234","CW":"95181234","CX":"412345678","CY":"96123456","CZ":"601123456","DE":"15123456789","DJ":"77831001","DK":"34412345","DM":"7672251234","DO":"8092345678","DZ":"551234567","EC":"991234567","EE":"51234567","EG":"1001234567","EH":"650123456","ER":"7123456","ES":"612345678","ET":"911234567","FI":"412345678","FJ":"7012345","FK":"51234","FM":"3501234","FO":"211234","FR":"612345678","GA":"06031234","GB":"7400123456","GD":"4734031234","GE":"555123456","GF":"694201234","GG":"7781123456","GH":"231234567","GI":"57123456","GL":"221234","GM":"3012345","GN":"601123456","GP":"690001234","GQ":"222123456","GR":"6912345678","GT":"51234567","GU":"6713001234","GW":"955012345","GY":"6091234","HK":"51234567","HN":"91234567","HR":"921234567","HT":"34101234","HU":"201234567","ID":"812345678","IE":"850123456","IL":"502345678","IM":"7924123456","IN":"8123456789","IO":"3801234","IQ":"7912345678","IR":"9123456789","IS":"6111234","IT":"3123456789","JE":"7797712345","JM":"8762101234","JO":"790123456","JP":"9012345678","KE":"712123456","KG":"700123456","KH":"91234567","KI":"72001234","KM":"3212345","KN":"8697652917","KP":"1921234567","KR":"1020000000","KW":"50012345","KY":"3453231234","KZ":"7710009998","LA":"2023123456","LB":"71123456","LC":"7582845678","LI":"660234567","LK":"712345678","LR":"770123456","LS":"50123456","LT":"61234567","LU":"628123456","LV":"21234567","LY":"912345678","MA":"650123456","MC":"612345678","MD":"62112345","ME":"60123456","MF":"690001234","MG":"321234567","MH":"2351234","MK":"72345678","ML":"65012345","MM":"92123456","MN":"88123456","MO":"66123456","MP":"6702345678","MQ":"696201234","MR":"22123456","MS":"6644923456","MT":"96961234","MU":"52512345","MV":"7712345","MW":"991234567","MX":"2221234567","MY":"123456789","MZ":"821234567","NA":"811234567","NC":"751234","NE":"93123456","NF":"381234","NG":"8021234567","NI":"81234567","NL":"612345678","NO":"40612345","NP":"9841234567","NR":"5551234","NU":"8884012","NZ":"211234567","OM":"92123456","PA":"61234567","PE":"912345678","PF":"87123456","PG":"70123456","PH":"9051234567","PK":"3012345678","PL":"512345678","PM":"551234","PR":"7872345678","PS":"599123456","PT":"912345678","PW":"6201234","PY":"961456789","QA":"33123456","RE":"692123456","RO":"712034567","RS":"601234567","RU":"9123456789","RW":"720123456","SA":"512345678","SB":"7421234","SC":"2510123","SD":"911231234","SE":"701234567","SG":"81234567","SH":"51234","SI":"31234567","SJ":"41234567","SK":"912123456","SL":"25123456","SM":"66661212","SN":"701234567","SO":"71123456","SR":"7412345","SS":"977123456","ST":"9812345","SV":"70123456","SX":"7215205678","SY":"944567890","SZ":"76123456","TA":"8999","TC":"6492311234","TD":"63012345","TG":"90112345","TH":"812345678","TJ":"917123456","TK":"7290","TL":"77212345","TM":"66123456","TN":"20123456","TO":"7715123","TR":"5012345678","TT":"8682911234","TV":"901234","TW":"912345678","TZ":"621234567","UA":"501234567","UG":"712345678","US":"2015550123","UY":"94231234","UZ":"912345678","VA":"3123456789","VC":"7844301234","VE":"4121234567","VG":"2843001234","VI":"3406421234","VN":"912345678","VU":"5912345","WF":"821234","WS":"7212345","XK":"43201234","YE":"712345678","YT":"639012345","ZA":"711234567","ZM":"955123456","ZW":"712345678"};
function exempleTel(pays){ try{ return libphonenumber.parsePhoneNumber(EXEMPLES_TEL[pays], pays).formatNational(); }catch(e){ return ""; } }
const PAYS_PRIORITAIRES = ["BJ","TG","CI","BF","NE","SN","ML","GN","CM","GA","CG","CD","CF","TD","RW","BI","MG","HT","FR","BE","CH","CA"];
const memoire = { get(k,d){ try{ return localStorage.getItem(k) || d; }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
let _pays = null;
function listePays(){
  if(_pays || !window.libphonenumber) return _pays || {prio:[], tous:[]};
  let noms; try{ noms = new Intl.DisplayNames(["fr"], {type:"region"}); }catch(e){ noms = {of:c=>c}; }
  const tous = libphonenumber.getCountries().map(c=>({c, nom:noms.of(c)||c, ind:libphonenumber.getCountryCallingCode(c)})).sort((a,b)=>a.nom.localeCompare(b.nom,"fr"));
  return _pays = {prio: PAYS_PRIORITAIRES.map(c=>tous.find(x=>x.c===c)).filter(Boolean), tous};
}
const estCompteTel = email => String(email||"").toLowerCase().endsWith("@"+DOMAINE_TEL);
function afficherIdentifiant(email){
  if(!estCompteTel(email)) return email || "";
  const n = "+" + String(email).split("@")[0];
  try{ return libphonenumber.parsePhoneNumber(n).formatInternational(); }catch(e){ return n; }
}
function modeIdentifiant(){ return memoire.get("hdf-id-mode", "tel"); }
function champIdentifiant(px){
  const mode = modeIdentifiant(), pays = memoire.get("hdf-pays", "BJ"), L = listePays();
  const opt = x => `<option value="${x.c}" ${x.c===pays?"selected":""}>${esc(x.nom)} (+${x.ind})</option>`;
  return `<div class="f"><span>Je me connecte avec</span>
    <div class="seg" role="tablist" style="max-width:360px">
      <button type="button" role="tab" data-idmode="tel" aria-selected="${mode==="tel"}">Numéro de téléphone</button>
      <button type="button" role="tab" data-idmode="email" aria-selected="${mode==="email"}">E-mail (Gmail…)</button></div></div>
    ${mode==="tel" ? `<div class="tel-ligne">
      <label class="f" for="${px}-pays">Pays<select id="${px}-pays" autocomplete="country">${L.prio.length?`<optgroup label="Pays fréquents">${L.prio.map(opt).join("")}</optgroup><optgroup label="Tous les pays">${L.tous.map(opt).join("")}</optgroup>`:`<option value="BJ">Bénin (+229)</option>`}</select></label>
      <label class="f" for="${px}-tel">Numéro de téléphone<input type="tel" id="${px}-tel" inputmode="tel" autocomplete="tel-national" placeholder="${esc(exempleTel(pays))}" required></label></div>
      <p class="hint" id="${px}-tel-info" aria-live="polite"></p>`
    : `<label class="f" for="${px}-email">Adresse e-mail<input type="email" id="${px}-email" autocomplete="email" required></label>`}`;
}
// Lit le champ et renvoie l'adresse de connexion ; refuse un numéro qui ne respecte pas le format du pays choisi
function lireIdentifiant(px){
  if(modeIdentifiant()==="email"){
    const email = document.getElementById(px+"-email").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Adresse e-mail invalide.");
    if(email.endsWith("@"+DOMAINE_TEL)) throw new Error("Adresse e-mail invalide.");
    return {email};
  }
  if(!window.libphonenumber) throw new Error("La vérification des numéros n'a pas pu se charger. Rechargez la page.");
  const pays = document.getElementById(px+"-pays").value, brut = document.getElementById(px+"-tel").value.trim();
  const L = listePays(), nomPays = (L.tous.find(x=>x.c===pays)||{nom:pays}).nom;
  if(!brut) throw new Error("Indiquez votre numéro de téléphone.");
  let num = null; try{ num = libphonenumber.parsePhoneNumber(brut, pays); }catch(e){}
  if(!num || !num.isValid() || num.country !== pays){
    const ex = exempleTel(pays) ? ` Exemple pour ce pays : ${exempleTel(pays)}.` : "";
    throw new Error(`Ce numéro ne respecte pas le format des numéros du pays choisi (${nomPays}, +${libphonenumber.getCountryCallingCode(pays)}). Vérifiez le pays et le nombre de chiffres.${ex}`);
  }
  memoire.set("hdf-pays", pays);
  return {email: num.number.slice(1) + "@" + DOMAINE_TEL, telephone: num.formatInternational(), pays: nomPays};
}
function lierIdentifiant(racine, rendu){
  racine.querySelectorAll("[data-idmode]").forEach(b=>b.onclick=()=>{ memoire.set("hdf-id-mode", b.dataset.idmode); rendu(); });
  racine.querySelectorAll("select[id$='-pays']").forEach(sel=>sel.onchange=()=>{ memoire.set("hdf-pays", sel.value); const t=document.getElementById(sel.id.replace("-pays","-tel")); if(t){ t.placeholder=exempleTel(sel.value); t.dispatchEvent(new Event("input")); t.focus(); } });
  racine.querySelectorAll("input[id$='-tel']").forEach(inp=>inp.oninput=()=>{
    const info=document.getElementById(inp.id+"-info"), pays=document.getElementById(inp.id.replace("-tel","-pays")).value; if(!info||!window.libphonenumber) return;
    let ok=false; try{ const n=libphonenumber.parsePhoneNumber(inp.value, pays); ok=n.isValid() && n.country===pays; if(ok) info.innerHTML=`<span style="color:var(--ok)">✓ ${esc(n.formatInternational())}</span>`; }catch(e){}
    if(!ok) info.textContent = inp.value.replace(/\D/g,"").length>=6 ? "Numéro incomplet ou invalide pour ce pays." : ""; });
}

window.HDF = {EXIGENCES, exigence, sur20, examenMin, estCompteTel, afficherIdentifiant, champIdentifiant, lireIdentifiant, lierIdentifiant, modeIdentifiant, identiteComplete, dateLongue, INSTITUTION, installation, HORS_LIGNE, SEUIL, MIN_PRATIQUE, esc, pct, note20, fmtDate, depuis, toast, shuffle, erreur, etuDepuis, regles, connecter, CONFIG_MANQUANTE, lierMotsDePasse};
})();
