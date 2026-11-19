// Code commun à l'espace étudiant (app.js) et à l'espace enseignant (enseignant.js).
(function(){
"use strict";
const SEUIL = 0.8;            // 16/20
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
  const fr = {"Invalid login credentials":"Adresse ou mot de passe incorrect.","Email not confirmed":"Ce compte n'est pas encore activé. Contactez le responsable de la formation.","User already registered":"Un compte existe déjà avec cette adresse. Connectez-vous.","Password should be at least 6 characters.":"Le mot de passe doit contenir au moins 6 caractères."};
  return fr[m] || m;
}

// Données d'un étudiant à partir de son profil, de ses lignes de progression et de ses tests de passage
function etuDepuis(p, rows, tests){
  const e = {id:p.id, nom:p.nom||"", eglise:p.eglise||"", inscrit:p.inscrit, role:p.role, enseignantId:p.enseignant_id||null,
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
    return { r, lus, nb, leconsFinies: lus>=nb, reussi:(r.meilleur||0) >= SEUIL,
      pratique:(r.pratique||"").trim().length >= MIN_PRATIQUE, certifie:!!r.certNo, valide:!!r.certNo || (r.meilleur||0) >= SEUIL,
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

window.HDF = {installation, HORS_LIGNE, SEUIL, MIN_PRATIQUE, esc, pct, note20, fmtDate, depuis, toast, shuffle, erreur, etuDepuis, regles, connecter, CONFIG_MANQUANTE, lierMotsDePasse};
})();
