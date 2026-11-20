// Espace enseignant : page séparée du site des étudiants (enseignant.html).
// Toutes les données sont protégées côté serveur : seules les personnes au rôle « enseignant » peuvent les lire.
(function(){
"use strict";
const {esc, pct, note20, fmtDate, depuis, toast, erreur, etuDepuis} = HDF;
const $app = document.getElementById("app");
const S = { prog:null, sb:null, session:null, profil:null, view:"tableau", etuId:null, filtre:"tous", recherche:"",
  etudiants:[], enseignants:[], notes:[], photos:{}, reglages:{}, charge:false, recovery:false, oubli:false };
let R = null;
const INACTIF_JOURS = 7;

// ---------- données ----------
async function charger(){
  const [p, g, t, n, r] = await Promise.all([
    S.sb.from("profils").select("*"),
    S.sb.from("progression").select("*"),
    S.sb.from("tests_passage").select("user_id,niveau,note20,reussi,fin").not("fin","is",null),
    S.sb.from("suivi_notes").select("*").order("cree",{ascending:false}),
    S.sb.from("reglages").select("*")
  ]);
  const err = p.error||g.error||t.error||n.error||r.error; if(err) throw err;
  const rows=g.data||[], tests=t.data||[];
  const tous=(p.data||[]).map(x=>etuDepuis(x, rows.filter(y=>y.user_id===x.id), tests.filter(y=>y.user_id===x.id)));
  S.enseignants = tous.filter(e=>e.role==="enseignant");
  S.etudiants = tous.filter(e=>e.role!=="enseignant");
  S.notes = n.data||[];
  S.reglages = Object.fromEntries((r.data||[]).map(x=>[x.cle, x.valeur]));
  S.charge = true;
}
async function rpc(fn, args){ const {data,error}=await S.sb.rpc(fn,args); if(error){ toast(erreur(error)); throw error; } return data; }
async function rafraichir(msg){ try{ S.photos={}; await charger(); if(msg) toast(msg); }catch(e){ toast(erreur(e)); } render(); }

// ---------- analyse d'un étudiant ----------
const nomEns = id => { const e=S.enseignants.find(x=>x.id===id); return e ? (e.nom||"Enseignant") : null; };
function ouEnEst(e){
  const all=R.allModules();
  const m = all.find(x=>!R.statut(x,e).valide && R.moduleOuvert(x,e));
  if(!m) return {fini:true, texte:"Programme terminé"};
  const s=R.statut(m,e), k=Array.from({length:s.nb},(_,i)=>i).find(i=>!e.lecons[m.id+"-"+i]);
  const et = k!=null ? e.etapes[m.id+"-"+k] : null;
  let detail;
  if(k==null) detail = s.tentatives ? `examen : ${s.tentatives} essai(s), meilleur ${note20(s.r.meilleur)}` : "leçons terminées, examen à passer";
  else detail = `leçon ${k+1}/${s.nb}` + (et ? `, étape ${et.atteinte}/${et.total}` : ", pas commencée");
  return {m, k, et, texte:`${m.titre}`, detail, niveau:R.niveauIndex(m.niveau)};
}
function alertes(e){
  const a=[], all=R.allModules();
  for(const m of all){ const s=R.statut(m,e);
    if(s.r.pratique && s.r.pratiqueStatut==="en_attente" && s.pratique) a.push({type:"temoignage", m, txt:`Témoignage à lire : ${m.titre}`});
    if(s.tentatives>=2 && !s.reussi) a.push({type:"difficulte", m, txt:`${s.tentatives} essais sans réussite : ${m.titre} (meilleur ${note20(s.r.meilleur)})`});
  }
  const derniere = e.maj || e.inscrit, jours = derniere ? (Date.now()-new Date(derniere))/864e5 : 0;
  if(jours>INACTIF_JOURS && !ouEnEst(e).fini) a.push({type:"inactif", txt:`Aucune activité depuis ${Math.floor(jours)} jours`});
  if(!e.enseignantId) a.push({type:"sans", txt:"Pas encore d'enseignant attitré"});
  return a;
}
function liste(){
  let l=S.etudiants;
  if(S.filtre==="miens") l=l.filter(e=>e.enseignantId===S.session.user.id);
  if(S.recherche){ const q=S.recherche.toLowerCase(); l=l.filter(e=>(e.nom+" "+e.eglise).toLowerCase().includes(q)); }
  return l.slice().sort((a,b)=>(b.maj||b.inscrit||"").localeCompare(a.maj||a.inscrit||""));
}

// ---------- navigation ----------
function go(view, etuId){ S.view=view; if(etuId!==undefined) S.etuId=etuId;
  const h = view==="fiche" ? "etudiant-"+S.etuId : view; if(location.hash!=="#"+h){ try{ history.replaceState(null,"","#"+h); }catch(e){} }
  render(); window.scrollTo({top:0}); }
function fromHash(){ const h=(location.hash||"").slice(1);
  if(h.startsWith("etudiant-")){ S.view="fiche"; S.etuId=h.slice(9); } else if(["tableau","etudiants","reglages"].includes(h)) S.view=h; }
document.getElementById("brand").onclick=()=>go("tableau");
document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));
document.getElementById("logout").onclick=async()=>{ await S.sb.auth.signOut(); };

// ---------- rendu ----------
function render(){
  const ens = S.session && S.profil && S.profil.role==="enseignant";
  document.getElementById("nav").hidden = !ens || S.recovery;
  document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.setAttribute("aria-current", b.dataset.view===S.view || (b.dataset.view==="etudiants" && S.view==="fiche") ? "page":"false"));
  let html;
  if(S.recovery) html=vNouveauMdp();
  else if(!S.session) html=vConnexion();
  else if(!S.profil) html=`<div class="empty">Chargement…</div>`;
  else if(!ens) html=`<section class="panel" style="display:grid;gap:12px;max-width:560px"><h2>Accès réservé aux enseignants</h2>
      <p>Le compte <b>${esc(S.session.user.email)}</b> est un compte étudiant. L'espace enseignant est ouvert par le responsable de la formation.</p>
      <div class="row"><a class="btn primary" href="index.html">Aller au site des étudiants</a><button class="btn" type="button" id="sortir">Se déconnecter</button></div></section>`;
  else if(!S.charge) html=`<div class="empty">Chargement des étudiants…</div>`;
  else html = ({tableau:vTableau, etudiants:vEtudiants, fiche:vFiche, reglages:vReglages}[S.view] || vTableau)();
  $app.innerHTML = html;
  bind();
}

function vConnexion(){
  return `<section class="hero"><p class="eyebrow">Héro de la Foi</p><h1>Espace enseignant</h1>
    <p class="lead">Suivez vos étudiants étape par étape, lisez et validez leurs témoignages de foi agissante, encouragez-les et accompagnez ceux qui ont des difficultés.</p></section>
  <form class="panel auth" id="auth-form" novalidate>
    <label class="f" for="a-email">Adresse e-mail<input type="email" id="a-email" autocomplete="email" required></label>
    ${S.oubli ? `<p class="hint">Nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>` :
    `<label class="f" for="a-mdp">Mot de passe<span class="pw"><input type="password" id="a-mdp" autocomplete="current-password" minlength="6" required><button type="button" class="pw-btn" data-pw="a-mdp" aria-controls="a-mdp" aria-pressed="false">Afficher</button></span></label>`}
    <div class="row"><button class="btn primary" type="submit">${S.oubli?"Envoyer le lien":"Se connecter"}</button>
      <button class="btn small" type="button" id="oubli">${S.oubli?"Retour":"Mot de passe oublié ?"}</button></div>
    <p class="hint" id="a-msg" role="status"></p>
  </form>
  <p class="hint">Pas encore de compte ? Créez-le sur le <a href="index.html">site des étudiants</a>, puis demandez au responsable de la formation de vous nommer enseignant.</p>`;
}
function vNouveauMdp(){
  return `<form class="panel auth" id="mdp-form"><h2>Choisir un nouveau mot de passe</h2>
    <label class="f" for="n-mdp">Nouveau mot de passe<span class="pw"><input type="password" id="n-mdp" minlength="6" required autocomplete="new-password"><button type="button" class="pw-btn" data-pw="n-mdp" aria-pressed="false">Afficher</button></span></label>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button></div><p class="hint" id="n-msg"></p></form>`;
}

const filtres = () => `<div class="row filtres"><div class="seg" role="tablist" style="max-width:360px">
    <button type="button" role="tab" data-filtre="miens" aria-selected="${S.filtre==="miens"}">Mes étudiants</button>
    <button type="button" role="tab" data-filtre="tous" aria-selected="${S.filtre==="tous"}">Tous</button></div>
  <button class="btn small" type="button" id="refresh">Actualiser</button></div>`;

function vTableau(){
  const l=liste(), moi=S.session.user.id;
  const mes=S.etudiants.filter(e=>e.enseignantId===moi).length;
  const items=l.flatMap(e=>alertes(e).map(a=>({...a, e})));
  const groupe=(type, titre, aide)=>{ const g=items.filter(x=>x.type===type); return `<section class="panel afaire"><div class="row" style="justify-content:space-between"><h3>${titre}</h3><span class="pill ${g.length?"bad":"ok"}">${g.length}</span></div><p class="hint">${aide}</p>
    ${g.length?`<ul class="alist">${g.slice(0,12).map(x=>`<li><button type="button" class="lien" data-fiche="${esc(x.e.id)}">${esc(x.e.nom||"Sans nom")}</button><span class="hint">${esc(x.txt)}</span>
      ${type==="sans"?`<button class="btn small" type="button" data-prendre="${esc(x.e.id)}">Je le prends en charge</button>`:""}</li>`).join("")}${g.length>12?`<li class="hint">… et ${g.length-12} autre(s)</li>`:""}</ul>`:`<p class="hint">Rien à faire ici pour l'instant.</p>`}</section>`; };
  const cert=l.reduce((a,e)=>a+R.allModules().filter(m=>R.statut(m,e).certifie).length,0);
  return `<section class="hero"><p class="eyebrow">Bonjour${S.profil.nom?", "+esc(S.profil.nom):""}</p><h1>Vos responsabilités aujourd'hui</h1>
    <p class="lead">Chaque étudiant doit être suivi par un enseignant. Lisez les témoignages, encouragez ceux qui n'avancent plus, aidez ceux qui échouent plusieurs fois à un examen, et laissez-leur des messages.</p></section>
  ${filtres()}
  <section class="stats"><div class="stat"><div class="v">${S.etudiants.length}</div><div class="l">étudiants inscrits</div></div>
    <div class="stat"><div class="v">${mes}</div><div class="l">étudiants que vous suivez</div></div>
    <div class="stat"><div class="v">${items.filter(x=>x.type==="temoignage").length}</div><div class="l">témoignages à lire</div></div>
    <div class="stat"><div class="v">${cert}</div><div class="l">attestations ${S.filtre==="miens"?"de vos étudiants":"délivrées"}</div></div></section>
  <div class="grid2">
    ${groupe("temoignage","Témoignages à lire","Lisez la foi agissante de l'étudiant, puis validez-la ou demandez-lui de la revoir.")}
    ${groupe("difficulte","Étudiants en difficulté","Plusieurs essais à l'examen sans atteindre 16/20 : proposez-leur de l'aide.")}
    ${groupe("inactif","Étudiants qui n'avancent plus",`Aucune activité depuis plus de ${INACTIF_JOURS} jours : envoyez-leur un message d'encouragement.`)}
    ${groupe("sans","Étudiants sans enseignant","Prenez-les en charge, ou confiez-les à un autre enseignant depuis leur fiche.")}
  </div>`;
}

function vEtudiants(){
  const l=liste();
  return `<section class="hero"><p class="eyebrow">Suivi</p><h1>Où en est chaque étudiant</h1><p class="lead">Module, leçon et étape en cours, résultats et dernière activité. Ouvrez une fiche pour le détail et pour agir.</p></section>
  ${filtres()}
  <label class="f" for="recherche" style="max-width:420px">Rechercher un étudiant<input type="text" id="recherche" value="${esc(S.recherche)}" placeholder="Nom ou église"></label>
  ${l.length ? `<div class="tbl"><table><thead><tr><th>Étudiant</th><th>Où il en est</th><th>Attestations</th><th>Enseignant</th><th>Dernière activité</th><th></th></tr></thead><tbody>
    ${l.map(e=>{ const o=ouEnEst(e), nb=R.allModules().filter(m=>R.statut(m,e).certifie).length, al=alertes(e).filter(a=>a.type!=="sans");
      return `<tr><td><b>${esc(e.nom||"Sans nom")}</b><br><span class="hint">${esc(e.eglise||"")}</span></td>
        <td>${o.fini?"<b>Programme terminé</b>":`<span class="pill" style="color:var(--n${o.niveau})">N${o.niveau}</span> ${esc(o.texte)}<br><span class="hint">${esc(o.detail)}</span>${o.et?`<div class="bar mini" style="--lc:var(--n${o.niveau})"><i style="width:${pct(o.et.atteinte,o.et.total)}%"></i></div>`:""}`}
          ${al.length?`<br>${al.map(a=>`<span class="pill bad">${esc(a.type==="temoignage"?"témoignage à lire":a.type==="difficulte"?"en difficulté":"inactif")}</span>`).join(" ")}`:""}</td>
        <td>${nb} / ${R.allModules().length}</td><td>${esc(nomEns(e.enseignantId)||"–")}</td><td>${depuis(e.maj||e.inscrit)}</td>
        <td><button class="btn small primary" type="button" data-fiche="${esc(e.id)}">Ouvrir</button></td></tr>`; }).join("")}
  </tbody></table></div>` : `<div class="panel empty">${S.filtre==="miens"?"Vous ne suivez encore aucun étudiant. Passez sur « Tous » pour en prendre en charge.":"Aucun étudiant pour l'instant. Partagez l'adresse du site : chaque étudiant crée son compte et apparaît ici."}</div>`}`;
}

function vFiche(){
  const e=S.etudiants.find(x=>x.id===S.etuId); if(!e) return `<div class="empty">Étudiant introuvable. <button class="lien" type="button" data-go="etudiants">Retour à la liste</button></div>`;
  const o=ouEnEst(e), notes=S.notes.filter(n=>n.etudiant_id===e.id), moi=S.session.user.id;
  const niveaux=S.prog.niveaux.filter(n=>R.niveauOuvert(n,e));
  return `<nav class="crumbs"><button type="button" data-go="etudiants">Étudiants</button><span>›</span><span>${esc(e.nom||"Sans nom")}</span></nav>
  <section class="hero"><p class="eyebrow">Fiche étudiant</p><h1>${esc(e.nom||"Sans nom")}</h1>
    <p class="hint">${[e.eglise, e.inscrit?"inscrit le "+fmtDate(e.inscrit):"", "dernière activité : "+depuis(e.maj||e.inscrit)].filter(Boolean).map(esc).join(" · ")}</p>
    <p><b>En ce moment :</b> ${o.fini?"programme terminé":`${esc(o.texte)} (${esc(o.detail)})`}</p></section>
  ${identiteHtml(e)}
  <div class="grid2">
    <section class="panel" style="display:grid;gap:10px"><p class="eyebrow">Enseignant attitré</p>
      <label class="f" for="attribuer">Cet étudiant est suivi par<select id="attribuer"><option value="">Personne pour l'instant</option>${S.enseignants.map(x=>`<option value="${esc(x.id)}" ${x.id===e.enseignantId?"selected":""}>${esc(x.nom||"Enseignant")}${x.id===moi?" (moi)":""}</option>`).join("")}</select></label>
      <div class="row"><button class="btn small primary" type="button" id="attribuer-ok">Enregistrer</button></div></section>
    <section class="panel" style="display:grid;gap:10px"><p class="eyebrow">Journal de suivi</p>
      <label class="f" for="note-txt">Ajouter une note ou un message<textarea id="note-txt" maxlength="2000" style="min-height:80px" placeholder="Ex. : Appel le 12 : il a des questions sur le baptême. / Bravo pour ton examen !"></textarea></label>
      <label class="checks" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="note-visible"> Message visible par l'étudiant (sinon, note privée entre enseignants)</label>
      <div class="row"><button class="btn small primary" type="button" id="note-ok">Ajouter</button></div>
      ${notes.length?`<ul class="alist">${notes.map(n=>`<li><div class="msg" style="flex:1"><p style="white-space:pre-wrap">${esc(n.texte)}</p><p class="hint">${n.visible?"💬 Message à l'étudiant":"🔒 Note privée"} · ${esc(nomEns(n.enseignant_id)||"")} · ${fmtDate(n.cree)}</p></div>${n.enseignant_id===moi?`<button class="btn small" type="button" data-suppr="${esc(n.id)}">Supprimer</button>`:""}</li>`).join("")}</ul>`:`<p class="hint">Aucune note pour l'instant.</p>`}</section>
  </div>
  ${niveaux.map(n=>{ const i=R.niveauIndex(n); return `<section class="panel" style="display:grid;gap:12px;border-top:5px solid var(--n${i})"><h2>Niveau ${i} · ${esc(n.nom)}</h2>
    ${(e.tests||[]).filter(t=>t.niveau===i).map(t=>`<p class="hint">Test de passage : ${String(t.note20).replace(".",",")}/20 ${t.reussi?"(réussi)":""} le ${fmtDate(t.fin)}</p>`).join("")}
    ${n.modules.map(m=>ficheModule(e,{...m, niveau:n})).join("")}</section>`; }).join("")}`;
}
function identiteHtml(e){
  const I=e.identite||{}, ph=S.photos[e.id];
  if(ph===undefined){ S.photos[e.id]=null; S.sb.from("photos").select("image").eq("user_id",e.id).maybeSingle().then(({data})=>{ S.photos[e.id]=data?data.image:false; if(S.view==="fiche"&&S.etuId===e.id) render(); }); }
  const ok=HDF.identiteComplete(e, ph);
  const l=(k,v)=>v?`<dt>${k}</dt><dd>${esc(v)}</dd>`:"";
  return `<section class="panel" style="display:grid;gap:10px"><div class="row" style="justify-content:space-between"><p class="eyebrow">Fiche d'identité</p><span class="pill ${ok?"ok":"bad"}">${ok?"complète":"incomplète : pas d'attestation possible"}</span></div>
    <div class="identite"><div class="photo-cadre" style="width:120px">${ph?`<img src="${ph}" alt="Photo d'identité de ${esc(e.nom)}">`:`<span class="hint">${ph===null?"Chargement…":"Pas de photo"}</span>`}</div>
    <dl>${l("Nom (acte de naissance)",I.nomNaissance)}${l("Né(e) le",HDF.dateLongue(I.dateNaissance))}${l("Lieu de naissance",I.lieuNaissance)}${l("Sexe",I.sexe==="F"?"Féminin":I.sexe==="M"?"Masculin":"")}${l("Nationalité",I.nationalite)}${l("Téléphone",I.telephone)}${l("Pays",I.pays)}${l("Ville",I.ville)}${l("Église",e.eglise)}</dl></div>
    <p class="hint">Vérifiez que la photo est bien une photo d'identité sur fond blanc. Si ce n'est pas le cas, laissez un message à l'étudiant dans le journal ci-dessous.</p></section>`;
}
function ficheModule(e, m){
  const s=R.statut(m,e), x=e.evaluations[m.id]||{}, ouvert=R.moduleOuvert(m,e);
  if(!ouvert && !s.commence) return `<div class="mod-ligne"><span class="dot">🔒</span><span>${esc(m.titre)}</span><span class="hint">verrouillé</span></div>`;
  const lecons=m.lecons.map((t,k)=>{ const lu=e.lecons[m.id+"-"+k], et=e.etapes[m.id+"-"+k];
    return `<li><span class="dot ${lu?"done":""}">${lu?"✓":k+1}</span><span style="flex:1;min-width:0">${esc(t)}</span><span class="hint">${lu?"terminée":et?`étape ${et.atteinte}/${et.total}`:"pas commencée"}</span></li>`; }).join("");
  const st=s.r.pratiqueStatut;
  return `<details class="lesson" ${s.r.pratique&&st==="en_attente"?"open":""}><summary><span class="dot ${s.certifie?"done":""}">${s.certifie?"✓":""}</span><h3>${esc(m.titre)}</h3>
      <span class="row" style="gap:6px">${s.r.meilleur!=null?`<span class="pill ${s.reussi?"ok":"bad"}">${s.parTest?"Test":"Examen"} ${note20(s.r.meilleur)}</span>`:""}${s.r.pratique?`<span class="pill ${st==="valide"?"ok":st==="a_revoir"?"bad":""}">${st==="valide"?"témoignage validé":st==="a_revoir"?"à revoir":"témoignage à lire"}</span>`:""}</span></summary>
    <div class="body">
      <ul class="lecons-suivi">${lecons}</ul>
      <p class="hint">Examen : ${s.tentatives?`${s.tentatives} essai(s), meilleure note ${note20(s.r.meilleur)}, dernière ${s.r.dernier!=null?note20(s.r.dernier):"–"}${s.r.dateExamen?" le "+fmtDate(s.r.dateExamen):""}`:"pas encore passé"}${s.certifie?` · attestation n° ${esc(s.r.certNo)}${s.parTest?" (test de passage)":""}`:""}</p>
      ${s.r.pratique?`<div class="block"><b>Témoignage de foi agissante</b>${s.r.pratiqueDate?` <span class="hint">du ${fmtDate(s.r.pratiqueDate)}</span>`:""}<p style="white-space:pre-wrap">${esc(s.r.pratique)}</p>
        <label class="f" for="avis-${m.id}">Remarque pour l'étudiant <span class="hint">(obligatoire si vous demandez de revoir)</span><input type="text" id="avis-${m.id}" value="${esc(s.r.pratiqueAvis||"")}" maxlength="1000"></label>
        <div class="row"><button class="btn small primary" type="button" data-temoignage="${m.id}" data-statut="valide">Valider le témoignage</button><button class="btn small" type="button" data-temoignage="${m.id}" data-statut="a_revoir">Demander de le revoir</button></div></div>`:`<p class="hint">Pas encore de témoignage.</p>`}
      <div class="row" style="align-items:flex-end">
        <label class="f" for="note-${m.id}" style="width:110px">Note /20<input type="text" inputmode="decimal" id="note-${m.id}" value="${esc(x.note??"")}"></label>
        <label class="f" for="com-${m.id}" style="flex:1;min-width:200px">Appréciation<input type="text" id="com-${m.id}" value="${esc(x.commentaire||"")}" maxlength="500"></label>
        <button class="btn small primary" type="button" data-noter="${m.id}" ${s.commence?"":"disabled"}>Enregistrer</button></div>
    </div></details>`;
}

function vReglages(){
  const oblig = S.reglages.validation_temoignage_obligatoire===true;
  return `<section class="hero"><p class="eyebrow">Réglages</p><h1>Règles de la formation</h1></section>
  <section class="panel" style="display:grid;gap:12px"><h3>Validation des témoignages</h3>
    <label class="checks" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="oblig" ${oblig?"checked":""} style="margin-top:5px"><span><b>L'attestation d'un module exige qu'un enseignant ait validé le témoignage.</b><br><span class="hint">Si cette case n'est pas cochée, l'étudiant reçoit son attestation sans attendre, sauf si un enseignant lui a demandé de revoir son témoignage. Cochez-la seulement si des enseignants lisent les témoignages chaque semaine.</span></span></label>
    <div class="row"><button class="btn primary" type="button" id="oblig-ok">Enregistrer</button></div></section>
  <section class="panel" style="display:grid;gap:10px"><h3>L'équipe des enseignants</h3>
    <ul class="alist">${S.enseignants.map(x=>`<li><b>${esc(x.nom||"Sans nom")}</b><span class="hint">${S.etudiants.filter(e=>e.enseignantId===x.id).length} étudiant(s) suivi(s)</span></li>`).join("")}</ul>
    <p class="hint">Pour nommer un nouvel enseignant : la personne crée son compte sur le site des étudiants, puis le responsable exécute dans Supabase la requête indiquée dans le fichier <b>supabase/nommer_enseignant.sql</b>.</p></section>`;
}

// ---------- interactions ----------
function bind(){
  HDF.lierMotsDePasse($app);
  $app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  $app.querySelectorAll("[data-fiche]").forEach(b=>b.onclick=()=>go("fiche", b.dataset.fiche));
  $app.querySelectorAll("[data-filtre]").forEach(b=>b.onclick=()=>{ S.filtre=b.dataset.filtre; render(); });
  const rf=document.getElementById("refresh"); if(rf) rf.onclick=()=>rafraichir("Données actualisées.");
  const so=document.getElementById("sortir"); if(so) so.onclick=()=>S.sb.auth.signOut();
  const rc=document.getElementById("recherche"); if(rc) rc.oninput=()=>{ S.recherche=rc.value; const pos=rc.selectionStart; render(); const n=document.getElementById("recherche"); n.focus(); n.setSelectionRange(pos,pos); };
  $app.querySelectorAll("[data-prendre]").forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ await rpc("attribuer_etudiant",{p_etudiant:b.dataset.prendre, p_enseignant:S.session.user.id}); rafraichir("Étudiant pris en charge."); }catch(e){ b.disabled=false; } });
  const at=document.getElementById("attribuer-ok"); if(at) at.onclick=async()=>{ try{ await rpc("attribuer_etudiant",{p_etudiant:S.etuId, p_enseignant:document.getElementById("attribuer").value||null}); rafraichir("Enseignant attitré enregistré."); }catch(e){} };
  const no=document.getElementById("note-ok"); if(no) no.onclick=async()=>{
    const texte=document.getElementById("note-txt").value.trim(); if(!texte){ toast("Écrivez d'abord la note."); return; }
    const {error}=await S.sb.from("suivi_notes").insert({etudiant_id:S.etuId, enseignant_id:S.session.user.id, texte, visible:document.getElementById("note-visible").checked});
    if(error){ toast(erreur(error)); return; } rafraichir("Note ajoutée."); };
  $app.querySelectorAll("[data-suppr]").forEach(b=>b.onclick=async()=>{ const {error}=await S.sb.from("suivi_notes").delete().eq("id",b.dataset.suppr); if(error){ toast(erreur(error)); return; } rafraichir("Note supprimée."); });
  $app.querySelectorAll("[data-temoignage]").forEach(b=>b.onclick=async()=>{
    const mid=b.dataset.temoignage, statut=b.dataset.statut, avis=document.getElementById("avis-"+mid).value.trim();
    if(statut==="a_revoir" && avis.length<5){ toast("Expliquez à l'étudiant ce qu'il doit revoir."); document.getElementById("avis-"+mid).focus(); return; }
    try{ await rpc("evaluer_temoignage",{p_etudiant:S.etuId, p_module:mid, p_statut:statut, p_avis:avis}); rafraichir(statut==="valide"?"Témoignage validé.":"L'étudiant verra votre demande sur la page du module."); }catch(e){} });
  $app.querySelectorAll("[data-noter]").forEach(b=>b.onclick=async()=>{
    const mid=b.dataset.noter, raw=document.getElementById("note-"+mid).value.trim().replace(",",".");
    const note = raw==="" ? null : Number(raw);
    if(raw!=="" && (isNaN(note)||note<0||note>20)){ toast("La note doit être comprise entre 0 et 20."); return; }
    const {error}=await S.sb.from("progression").update({note, commentaire:document.getElementById("com-"+mid).value.trim()||null, date_eval:new Date().toISOString()}).eq("user_id",S.etuId).eq("module_id",mid);
    if(error){ toast(erreur(error)); return; } rafraichir("Appréciation enregistrée."); });
  const ob=document.getElementById("oblig-ok"); if(ob) ob.onclick=async()=>{
    const {error}=await S.sb.from("reglages").update({valeur:document.getElementById("oblig").checked}).eq("cle","validation_temoignage_obligatoire");
    if(error){ toast(erreur(error)); return; } rafraichir("Réglage enregistré."); };
  const ou=document.getElementById("oubli"); if(ou) ou.onclick=()=>{ S.oubli=!S.oubli; render(); };
  const af=document.getElementById("auth-form"); if(af) af.onsubmit=async ev=>{ ev.preventDefault();
    const msg=document.getElementById("a-msg"), email=document.getElementById("a-email").value.trim(); msg.textContent="Un instant…";
    try{
      if(S.oubli){ const {error}=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}); if(error) throw error; msg.textContent="Si un compte existe pour cette adresse, un lien vient d'être envoyé."; }
      else { const {error}=await S.sb.auth.signInWithPassword({email, password:document.getElementById("a-mdp").value}); if(error) throw error; msg.textContent=""; }
    }catch(err){ msg.textContent=erreur(err); } };
  const mf=document.getElementById("mdp-form"); if(mf) mf.onsubmit=async ev=>{ ev.preventDefault();
    const {error}=await S.sb.auth.updateUser({password:document.getElementById("n-mdp").value});
    if(error){ document.getElementById("n-msg").textContent=erreur(error); return; } S.recovery=false; toast("Mot de passe modifié."); render(); };
}

// ---------- démarrage ----------
async function demarrer(){
  try{
    const {prog, sb, horsLigne} = await HDF.connecter();
    S.prog=prog; R=HDF.regles(prog);
    if(!sb){ $app.innerHTML = horsLigne ? HDF.HORS_LIGNE : HDF.CONFIG_MANQUANTE; return; }
    S.sb=sb; fromHash();
    const ouvrir = async session => {
      S.session=session; S.profil=null; S.charge=false; render();
      if(!session) return;
      const {data, error} = await S.sb.from("profils").select("*").eq("id",session.user.id).maybeSingle();
      if(error){ toast(erreur(error)); return; }
      S.profil = data || {role:"etudiant"}; render();
      if(S.profil.role==="enseignant") await rafraichir();
    };
    S.sb.auth.onAuthStateChange((event, session)=>{ setTimeout(()=>{
      if(event==="PASSWORD_RECOVERY"){ S.recovery=true; render(); }
      if((session&&session.user.id)!==(S.session&&S.session.user.id)) ouvrir(session);
    },0); });
    const {data} = await S.sb.auth.getSession();
    await ouvrir(data.session);
  }catch(e){ $app.innerHTML='<div class="empty">L\'espace enseignant n\'a pas pu démarrer. Rechargez la page.</div>'; }
}
window.addEventListener("hashchange",()=>{ fromHash(); render(); });
demarrer();
HDF.installation("enseignant");
})();
