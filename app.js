(function(){
"use strict";
const SEUIL = 0.8;            // 16/20
const MIN_PRATIQUE = 80;
const $app = document.getElementById("app");
const S = {
  prog:null, mods:{}, view:"parcours", moduleId:null, exam:null, test:null, niveauTest:null,
  sb:null, session:null, profil:null, recovery:false, authMode:"connexion",
  etu:{nom:"", eglise:"", modules:{}, lecons:{}, evaluations:{}},
  etudiants:[], selEtu:null, lus:{}
};

// ---------- utilitaires ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct = (a,b) => b ? Math.round(a*100/b) : 0;
const note20 = x => (Math.round((x||0)*200)/10).toLocaleString("fr-FR") + "/20";
const fmtDate = iso => { try{ return new Date(iso).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}); }catch(e){ return ""; } };
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,4200); }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function allModules(){ return S.prog.niveaux.flatMap(n=>n.modules.map(m=>({...m, niveau:n}))); }
function findModule(id){ return allModules().find(m=>m.id===id); }
function niveauIndex(n){ return S.prog.niveaux.indexOf(n)+1; }
function erreur(e){
  const m = (e && (e.message||e.error_description)) || "Erreur inconnue";
  const fr = {"Invalid login credentials":"Adresse ou mot de passe incorrect.","Email not confirmed":"Ce compte n'est pas encore activé. Contactez le responsable de la formation.","User already registered":"Un compte existe déjà avec cette adresse. Connectez-vous.","Password should be at least 6 characters.":"Le mot de passe doit contenir au moins 6 caractères."};
  return fr[m] || m;
}
async function getModule(id){
  if(!S.mods[id]) S.mods[id] = await fetch("modules/"+id+".json").then(r=>{ if(!r.ok) throw new Error("Module introuvable"); return r.json(); });
  return S.mods[id];
}

// ---------- règles de progression (les mêmes sont vérifiées sur le serveur) ----------
function statut(m, etu){
  etu = etu || S.etu;
  const r = (etu.modules||{})[m.id] || {};
  const nb = (m.lecons||[]).length;
  const lus = Array.from({length:nb},(_,i)=>i).filter(i=>(etu.lecons||{})[m.id+"-"+i]).length;
  return { r, lus, nb, leconsFinies: lus>=nb, reussi:(r.meilleur||0) >= SEUIL,
    pratique:(r.pratique||"").trim().length >= MIN_PRATIQUE, certifie:!!r.certNo, valide:!!r.certNo || (r.meilleur||0) >= SEUIL, tentatives:r.tentatives||0, parTest:r.origine==="test" };
}
function niveauFini(n, etu){ return n.modules.every(m=>statut(m,etu).certifie); }
function niveauValide(n, etu){ return n.modules.every(m=>statut(m,etu).valide); }
function niveauOuvert(n, etu){ const i=S.prog.niveaux.indexOf(n); return i===0 || niveauValide(S.prog.niveaux[i-1], etu); }
function moduleOuvert(m, etu){ const all=allModules(), k=all.findIndex(x=>x.id===m.id); return k===0 || statut(all[k-1], etu).valide; }
function precedent(m){ const all=allModules(), k=all.findIndex(x=>x.id===m.id); return k>0 ? all[k-1] : null; }

// ---------- données Supabase ----------
function etuDepuis(p, rows){
  const e = {id:p.id, nom:p.nom||"", eglise:p.eglise||"", inscrit:p.inscrit, role:p.role, modules:{}, lecons:{}, evaluations:{}, maj:null};
  for(const r of rows){
    e.modules[r.module_id] = {meilleur:(r.tentatives||r.cert_no) ? Number(r.meilleur) : null, dernier:r.dernier, tentatives:r.tentatives,
      pratique:r.pratique, certNo:r.cert_no, certDate:r.cert_date, origine:r.origine||"cours"};
    (r.lecons||[]).forEach(i=>{ e.lecons[r.module_id+"-"+i]=true; });
    if(r.note!=null || r.commentaire) e.evaluations[r.module_id] = {note:r.note, commentaire:r.commentaire};
    if(!e.maj || r.maj>e.maj) e.maj = r.maj;
  }
  return e;
}
async function chargerEtu(){
  const uid = S.session.user.id;
  const [p, g] = await Promise.all([
    S.sb.from("profils").select("*").eq("id",uid).maybeSingle(),
    S.sb.from("progression").select("*").eq("user_id",uid)
  ]);
  if(p.error) throw p.error; if(g.error) throw g.error;
  S.profil = p.data || {id:uid, nom:"", eglise:"", role:"etudiant"};
  S.etu = etuDepuis(S.profil, g.data||[]);
  document.getElementById("tab-enseignant").hidden = S.profil.role!=="enseignant";
}
async function chargerEnseignant(){
  const [p, g, t] = await Promise.all([S.sb.from("profils").select("*"), S.sb.from("progression").select("*"), S.sb.from("tests_passage").select("user_id,niveau,note20,reussi,fin").not("fin","is",null)]);
  if(p.error||g.error){ toast(erreur(p.error||g.error)); return; }
  const rows = g.data||[], tests = t.data||[];
  S.etudiants = (p.data||[]).map(x=>({...etuDepuis(x, rows.filter(r=>r.user_id===x.id)), tests:tests.filter(y=>y.user_id===x.id)}));
}
async function rpc(fn, args){
  const {data, error} = await S.sb.rpc(fn, args);
  if(error){ toast(erreur(error)); throw error; }
  return data;
}

// ---------- navigation ----------
async function go(view, moduleId){
  if(moduleId!==undefined) S.moduleId=moduleId;
  if(view==="module"||view==="examen"){
    const m=findModule(S.moduleId);
    if(m && !moduleOuvert(m)){ const p=precedent(m); toast(`Module verrouillé. Obtenez d'abord au moins 16/20 au module « ${p.titre} », ou réussissez le test de passage du niveau.`); return; }
    if(m && !S.mods[m.id]){ S.view="chargement"; render(); try{ await getModule(m.id); }catch(e){ toast("Le module n'a pas pu être chargé."); view="parcours"; } }
  }
  if(view==="examen"){ const m=findModule(S.moduleId); if(!statut(m).leconsFinies){ toast("Terminez d'abord toutes les leçons et leurs lectures obligatoires."); view="module"; } }
  S.view=view;
  if(view!=="examen") S.exam=null;
  if(view!=="test") S.test=null;
  const h = view==="module"||view==="examen" ? "m-"+S.moduleId : view;
  if(location.hash!=="#"+h){ try{ history.replaceState(null,"","#"+h); }catch(e){} }
  if(view==="enseignant") chargerEnseignant().then(render);
  render(); window.scrollTo({top:0});
}
function fromHash(){
  const h=(location.hash||"").slice(1);
  if(h.startsWith("m-") && findModule(h.slice(2))){ S.view="module"; S.moduleId=h.slice(2); }
  else if(["parcours","programme","enseignant","verifier"].includes(h)) S.view=h;
}
document.getElementById("brand").onclick=()=>go(S.session?"parcours":"connexion");
document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));
document.getElementById("logout").onclick=async()=>{ await S.sb.auth.signOut(); };

// ---------- rendu ----------
function render(){
  if(!S.prog) return;
  document.getElementById("nav").hidden = !S.session || S.recovery;
  document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.setAttribute("aria-current", b.dataset.view===S.view || (b.dataset.view==="parcours" && ["module","examen","test"].includes(S.view)) ? "page":"false"));
  let html;
  if(S.view==="verifier") html=vVerifier();
  else if(S.recovery) html=vNouveauMdp();
  else if(!S.session) html=vAuth();
  else if(S.view==="chargement") html=`<div class="empty">Chargement du cours…</div>`;
  else if(S.view==="module" && !S.mods[S.moduleId]){ go("module"); html=`<div class="empty">Chargement du cours…</div>`; }
  else html = ({parcours:vParcours, programme:vProgramme, module:vModule, examen:vExamen, test:vTest, enseignant:vEnseignant}[S.view] || vParcours)();
  $app.innerHTML = html;
  bind();
}

function vAuth(){
  const m=S.authMode;
  return `<section class="hero"><p class="eyebrow">Programme de formation biblique</p><h1>De la conversion à la maturité&nbsp;: devenir un héros de la foi</h1>
    <p class="lead">Quatre niveaux, vingt-quatre modules, des examens en ligne et une attestation pour chaque module réussi. Créez votre compte pour commencer, ou connectez-vous pour reprendre votre parcours.</p></section>
  <form class="panel auth" id="auth-form" novalidate>
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-mode="connexion" aria-selected="${m==="connexion"}">Se connecter</button>
      <button type="button" role="tab" data-mode="inscription" aria-selected="${m==="inscription"}">Créer un compte</button>
    </div>
    ${m==="inscription" ? `<label class="f" for="a-nom">Nom complet <span class="hint">(il figurera sur vos attestations)</span><input type="text" id="a-nom" autocomplete="name" maxlength="80" required></label>
      <label class="f" for="a-eglise">Église ou assemblée <span class="hint">(facultatif)</span><input type="text" id="a-eglise" maxlength="80"></label>` : ""}
    <label class="f" for="a-email">Adresse e-mail<input type="email" id="a-email" autocomplete="email" required></label>
    ${m!=="oubli" ? `<label class="f" for="a-mdp">Mot de passe<span class="pw"><input type="password" id="a-mdp" autocomplete="${m==="inscription"?"new-password":"current-password"}" minlength="6" required><button type="button" class="pw-btn" data-pw="a-mdp" aria-controls="a-mdp" aria-pressed="false">Afficher</button></span></label>` : `<p class="hint">Nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>`}
    <div class="row"><button class="btn primary" type="submit">${m==="connexion"?"Se connecter":m==="inscription"?"Créer mon compte":"Envoyer le lien"}</button>
      ${m==="connexion" ? `<button class="btn small" type="button" data-mode="oubli">Mot de passe oublié ?</button>` : ""}
      ${m==="oubli" ? `<button class="btn small" type="button" data-mode="connexion">Retour</button>` : ""}</div>
    <p class="hint" id="a-msg" role="status"></p>
  </form>
  <p class="hint">Vous avez reçu une attestation et voulez la vérifier ? <a href="#verifier">Vérifier une attestation</a></p>`;
}
function vNouveauMdp(){
  return `<form class="panel auth" id="mdp-form"><h2>Choisir un nouveau mot de passe</h2>
    <label class="f" for="n-mdp">Nouveau mot de passe<span class="pw"><input type="password" id="n-mdp" autocomplete="new-password" minlength="6" required><button type="button" class="pw-btn" data-pw="n-mdp" aria-controls="n-mdp" aria-pressed="false">Afficher</button></span></label>
    <div class="row"><button class="btn primary" type="submit">Enregistrer</button></div><p class="hint" id="n-msg" role="status"></p></form>`;
}
function vVerifier(){
  return `<section class="hero"><p class="eyebrow">Vérification</p><h1>Vérifier une attestation</h1><p class="lead">Saisissez le numéro inscrit en bas de l'attestation, par exemple HDF-N1M1-1A2B3C.</p></section>
  <form class="panel auth" id="verif-form"><label class="f" for="v-no">Numéro d'attestation<input type="text" id="v-no" maxlength="40" required></label>
  <div class="row"><button class="btn primary" type="submit">Vérifier</button><a class="btn small" href="#parcours">Retour</a></div><div id="v-res"></div></form>`;
}

function profilForm(){
  return `<section class="panel" style="display:grid;gap:14px">
    <div><p class="eyebrow">Votre fiche d'étudiant</p><h2>Le nom qui figurera sur vos attestations</h2></div>
    <div class="grid2">
      <label class="f" for="p-nom">Nom complet<input type="text" id="p-nom" value="${esc(S.etu.nom)}" maxlength="80"></label>
      <label class="f" for="p-eglise">Église ou assemblée <span class="hint">(facultatif)</span><input type="text" id="p-eglise" value="${esc(S.etu.eglise)}" maxlength="80"></label>
    </div>
    <div class="row"><button class="btn primary" id="p-save" type="button">Enregistrer ma fiche</button><span class="hint">Connecté : ${esc(S.session.user.email)}</span></div>
  </section>`;
}

function vParcours(){
  const mods = allModules();
  const cert = mods.filter(m=>statut(m).certifie).length;
  const scores = mods.map(m=>statut(m).r.meilleur).filter(x=>x!=null);
  const moy = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
  const next = mods.find(m=>!statut(m).certifie);
  return `<section class="hero">
    <p class="eyebrow">${S.etu.nom ? "Bienvenue, "+esc(S.etu.nom) : "Programme de formation biblique"}</p>
    <h1>De la conversion à la maturité&nbsp;: devenir un héros de la foi</h1>
    <p class="lead">Les modules s'ouvrent l'un après l'autre : il faut au moins 16/20 à l'examen d'un module pour ouvrir le suivant. Si vous connaissez déjà la matière d'un niveau, passez son test de passage (80 questions) : avec 16/20, vous recevez directement toutes les attestations du niveau.</p>
  </section>
  <section class="stats" aria-label="Résumé">
    <div class="stat"><div class="v">${cert}<span style="font-size:1rem;color:var(--muted)"> / ${mods.length}</span></div><div class="l">attestations obtenues</div></div>
    <div class="stat"><div class="v">${S.prog.niveaux.filter(n=>niveauFini(n)).length}<span style="font-size:1rem;color:var(--muted)"> / 4</span></div><div class="l">diplômes de niveau</div></div>
    <div class="stat"><div class="v">${moy==null?"–":note20(moy)}</div><div class="l">moyenne aux examens</div></div>
  </section>
  ${next ? `<section class="panel row" style="justify-content:space-between"><div><p class="eyebrow">Prochaine étape</p><h3>${esc(next.titre)}</h3><p class="hint">Niveau ${niveauIndex(next.niveau)} · ${esc(next.niveau.nom)}</p></div><button class="btn primary" data-open="${next.id}" type="button">Continuer</button></section>` : `<section class="panel"><h3>Félicitations ! Vous avez terminé tout le programme.</h3></section>`}
  ${!S.etu.nom ? profilForm() : ""}
  <section class="levels">${S.prog.niveaux.map(levelCard).join("")}</section>
  ${S.etu.nom ? profilForm() : ""}`;
}

function levelCard(n){
  const i = niveauIndex(n), ouvert = niveauOuvert(n), fini = niveauFini(n);
  const done = n.modules.filter(m=>statut(m).certifie).length;
  return `<article class="level ${ouvert?"":"locked"}" style="--lc:var(--n${i})">
    <div class="head"><div><div class="num">Niveau ${i}</div><h2>${esc(n.nom)}</h2></div><span class="pill ${fini?"cert":""}">${done} / ${n.modules.length}</span></div>
    <p class="hint">${esc(n.sousTitre)}</p>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n.modules.length}" aria-valuenow="${done}"><i style="width:${pct(done,n.modules.length)}%"></i></div>
    ${ouvert ? "" : `<p class="lockmsg">Verrouillé : validez d'abord le niveau ${i-1} (${esc(S.prog.niveaux[i-2].nom)}).</p>`}
    <ul class="mods">${n.modules.map((m,k)=>{ const s=statut(m), o=moduleOuvert(m);
      const pill = s.certifie ? `<span class="pill cert">${s.parTest?"Validé par test":"Attestation"}</span>` : !o ? `<span class="pill">Verrouillé</span>` : s.reussi ? `<span class="pill ok">Examen réussi</span>` : s.tentatives ? `<span class="pill bad">À reprendre</span>` : s.lus ? `<span class="pill">${s.lus}/${s.nb} leçons</span>` : "";
      return `<li><button type="button" data-open="${m.id}" ${o?"":'aria-disabled="true"'}><span class="dot ${s.certifie?"done":""}">${s.certifie?"✓":o?k+1:"🔒"}</span><span class="t">${esc(m.titre)}</span>${pill}</button></li>`; }).join("")}</ul>
    ${fini ? `<button class="btn gold" type="button" data-diplome="${n.id}">Télécharger le diplôme du niveau ${i}</button>`
      : ouvert && !niveauValide(n) ? `<button class="btn" type="button" data-test="${i}">Passer le test de passage du niveau (80 questions)</button>` : ""}
  </article>`;
}

function vProgramme(){
  return `<section class="hero"><p class="eyebrow">Plan de formation</p><h1>Le programme complet</h1>
    <p class="lead">Le parcours suit la croissance d'un croyant : naître de nouveau, grandir dans tous les domaines de la vie, servir, puis conduire et former d'autres.</p></section>
    <section class="panel"><h3>Comment fonctionne un module</h3>
    <div class="steps" style="margin-top:12px">
      <div class="step"><b>1. Lire</b>Les passages bibliques obligatoires de chaque leçon</div>
      <div class="step"><b>2. Étudier</b>Récit biblique, exégèse, enseignement et application</div>
      <div class="step"><b>3. Agir</b>Une mise en pratique de la foi, décrite par écrit</div>
      <div class="step"><b>4. Examen</b>20 questions, au moins 16/20 pour ouvrir le module suivant</div>
      <div class="step"><b>5. Attestation</b>Un PDF numéroté, puis un diplôme par niveau</div>
    </div>
    <p class="hint" style="margin-top:12px">Test de passage : 80 questions tirées au hasard dans tout le niveau, notées sur 20. Avec au moins 16/20, toutes les attestations du niveau sont délivrées et le niveau suivant s'ouvre. Trois essais au plus par 24 heures.</p></section>
    ${S.prog.niveaux.map(n=>{ const i=niveauIndex(n); return `<section class="panel" style="border-top:5px solid var(--n${i});display:grid;gap:12px">
      <div><p class="eyebrow" style="color:var(--n${i})">Niveau ${i}</p><h2>${esc(n.nom)} : ${esc(n.sousTitre)}</h2></div>
      <p class="lead">${esc(n.description)}</p>
      <p class="verse">${esc(n.verset)}</p>
      <div class="tbl"><table class="prog-table"><thead><tr><th>Module</th><th>Leçons</th><th>Foi agissante</th></tr></thead><tbody>
      ${n.modules.map((m,k)=>`<tr><td><b>${k+1}. ${esc(m.titre)}</b><br><span class="hint">${esc(m.objectif)}</span></td><td>${m.lecons.map(esc).join("<br>")}</td><td class="hint">${esc(m.pratique)}</td></tr>`).join("")}
      </tbody></table></div></section>`; }).join("")}`;
}

// ----- une leçon complète -----
const paras = arr => (arr||[]).map(p=>`<p>${esc(p)}</p>`).join("");
const sections = arr => (arr||[]).map(s=>`${s.titre?`<h4>${esc(s.titre)}</h4>`:""}${paras(s.paragraphes)}`).join("");
function vLecon(m, l, k){
  const lu=(S.etu.lecons||{})[m.id+"-"+k];
  const lectures=l.lectures||[];
  const cocher = !lu && lectures.length;
  const premiere = (m.lecons||[]).findIndex((_,i)=>!(S.etu.lecons||{})[m.id+"-"+i]);
  return `<details class="lesson" ${k===premiere?"open":""}>
    <summary><span class="dot ${lu?"done":""}">${lu?"✓":k+1}</span><h3>${esc(l.titre)}</h3></summary>
    <div class="body">
      ${lectures.length?`<div class="block read"><h4>Lectures obligatoires</h4><p class="hint">Ouvrez votre Bible et lisez chaque passage avant d'étudier la leçon.</p>
        <ul class="checks">${lectures.map((x,j)=>`<li><label for="lu-${k}-${j}"><input type="checkbox" id="lu-${k}-${j}" data-lect="${k}" ${lu||S.lus[m.id+k+"-"+j]?"checked":""} ${lu?"disabled":""}><span><b>${esc(x.ref)}</b>${x.resume?` : ${esc(x.resume)}`:""}</span></label></li>`).join("")}</ul></div>`:""}
      ${l.recit?`<div class="block story"><p class="eyebrow">Récit biblique · ${esc(l.recit.ref)}</p><h4>${esc(l.recit.titre)}</h4>${paras(l.recit.paragraphes)}
        ${(l.recit.lecons||[]).length?`<p><b>Ce que ce récit nous enseigne</b></p><ul>${l.recit.lecons.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}</div>`:""}
      ${(l.exegese||[]).length?`<div class="block"><p class="eyebrow">Exégèse</p>${sections(l.exegese)}</div>`:""}
      ${(l.motsCles||[]).length?`<div class="block"><p class="eyebrow">Mots clés de la langue originale</p><div class="words">${l.motsCles.map(w=>`<div class="word"><b>${esc(w.mot)}</b> <span class="hint">${esc(w.langue)} · <i>${esc(w.original)}</i></span><p>${esc(w.sens)}</p></div>`).join("")}</div></div>`:""}
      ${(l.enseignement||[]).length?`<div class="block"><p class="eyebrow">Enseignement biblique</p>${sections(l.enseignement)}</div>`:""}
      ${(l.citations||[]).map(c=>`<blockquote><p>${esc(c.texte)}</p><cite>${esc(c.ref)} (Louis Segond 1910)</cite></blockquote>`).join("")}
      ${(l.application||[]).length?`<div class="block"><p class="eyebrow">Dans notre monde aujourd'hui</p>${sections(l.application)}</div>`:""}
      ${l.etudeDeCas?`<div class="block case"><p class="eyebrow">Étude de cas</p><p>${esc(l.etudeDeCas.situation)}</p><ol>${(l.etudeDeCas.questions||[]).map(q=>`<li>${esc(q)}</li>`).join("")}</ol></div>`:""}
      ${(l.reflexion||[]).length?`<div class="block"><p class="eyebrow">Pour réfléchir</p><ul>${l.reflexion.map(q=>`<li>${esc(q)}</li>`).join("")}</ul></div>`:""}
      ${(l.retenir||[]).length?`<div class="keep">À retenir<ul>${l.retenir.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
      ${l.memoriser?`<div class="block memo"><p class="eyebrow">Verset à mémoriser · ${esc(l.memoriser.ref)}</p><p class="verse">${esc(l.memoriser.texte)}</p></div>`:""}
      ${l.priere?`<p class="verse"><b>Prière :</b> ${esc(l.priere)}</p>`:""}
      <div class="row"><button class="btn ${lu?"small":"primary"}" type="button" data-lu="${k}" ${lu||cocher&&!lectures.every((_,j)=>S.lus[m.id+k+"-"+j])?"disabled":""}>${lu?"Leçon terminée":"J'ai lu les passages et terminé cette leçon"}</button>${cocher?`<span class="hint">Cochez d'abord chaque lecture.</span>`:""}</div>
    </div></details>`;
}

function vModule(){
  const m = findModule(S.moduleId); const c = S.mods[S.moduleId]; if(!m||!c) return vParcours();
  const n=m.niveau, i=niveauIndex(n), s=statut(m), ev=(S.etu.evaluations||{})[m.id];
  return `<nav class="crumbs" aria-label="Fil d'Ariane"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><span>Niveau ${i} · ${esc(n.nom)}</span></nav>
  <section class="hero"><p class="eyebrow" style="color:var(--n${i})">Module ${n.modules.indexOf(m)+1} sur ${n.modules.length}</p><h1>${esc(m.titre)}</h1><p class="lead"><b>Objectif :</b> ${esc(m.objectif)}</p></section>
  <section class="steps" aria-label="Avancement">
    <div class="step ${s.leconsFinies?"on":""}"><b>Leçons</b>${s.lus} / ${s.nb} terminées</div>
    <div class="step ${s.pratique?"on":""}"><b>Foi agissante</b>${s.pratique?"Témoignage déposé":"À faire"}</div>
    <div class="step ${s.reussi?"on":""}"><b>Examen</b>${s.r.meilleur!=null?note20(s.r.meilleur):"Non passé"}</div>
    <div class="step ${s.certifie?"on":""}"><b>Attestation</b>${s.certifie?(s.parTest?"Par test de passage":"Obtenue"):"Pas encore"}</div>
  </section>
  ${(c.introduction||[]).length?`<section class="panel prose">${paras(c.introduction)}</section>`:""}
  ${(c.lecturesObligatoires||[]).length?`<section class="panel"><p class="eyebrow">Plan de lecture du module</p><h2>Lectures bibliques obligatoires</h2><ul class="readlist">${c.lecturesObligatoires.map(x=>`<li><b>${esc(x.ref)}</b>${x.consigne?` : ${esc(x.consigne)}`:""}</li>`).join("")}</ul></section>`:""}
  ${c.lecons.map((l,k)=>vLecon(m,l,k)).join("")}
  <section class="panel" style="display:grid;gap:12px">
    <div><p class="eyebrow">Foi agissante</p><h2>Mise en pratique</h2></div>
    <p>${esc(c.pratique.consigne)}</p>
    ${(c.pratique.etapes||[]).length?`<ol>${c.pratique.etapes.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`:""}
    <label class="f" for="pratique">Votre témoignage <span class="hint">(au moins ${MIN_PRATIQUE} caractères ; votre enseignant pourra le lire et le noter)</span>
      <textarea id="pratique" maxlength="4000">${esc(s.r.pratique||"")}</textarea></label>
    <div class="row"><button class="btn" id="save-pratique" type="button">Enregistrer mon témoignage</button><span class="hint" id="pr-count"></span></div>
    ${ev ? `<div class="keep" style="background:var(--surface2);border-color:var(--navy)">Appréciation de l'enseignant${ev.note!=null?` : <b>${esc(ev.note)}/20</b>`:""}${ev.commentaire?`<br><span style="font-weight:400">${esc(ev.commentaire)}</span>`:""}</div>`:""}
  </section>
  <section class="panel" style="display:grid;gap:12px">
    <div><p class="eyebrow">Évaluation</p><h2>Examen du module</h2></div>
    <p class="hint">${c.examen.length} questions corrigées en ligne, notées sur 20. Il faut au moins 16/20 pour ouvrir le module suivant. Vous pouvez repasser l'examen autant de fois que nécessaire ; la meilleure note est conservée.${s.tentatives?` Tentatives : ${s.tentatives}.`:""}</p>
    <div class="row"><button class="btn primary" type="button" data-go="examen" ${s.leconsFinies?"":"disabled"}>${s.tentatives?"Repasser l'examen":"Commencer l'examen"}</button>${s.leconsFinies?"":`<span class="hint">Disponible quand les ${s.nb} leçons sont terminées.</span>`}</div>
  </section>
  ${certSection(m,s)}`;
}

function certSection(m,s){
  if(s.certifie) return `<section class="cert"><p class="eyebrow">Attestation n° ${esc(s.r.certNo)}</p><div class="nm">${esc(S.etu.nom)}</div><p>${s.parTest?`a validé le module « ${esc(m.titre)} » par le test de passage du niveau, avec ${note20(s.r.meilleur)}.`:`a réussi le module « ${esc(m.titre)} » avec ${note20(s.r.meilleur)} et a mis sa foi en pratique.`}</p><p class="hint">Délivrée le ${fmtDate(s.r.certDate)}</p><div class="row" style="justify-content:center"><button class="btn gold" type="button" data-pdf="${m.id}">Télécharger l'attestation (PDF)</button></div></section>`;
  const manque = [];
  if(!S.etu.nom) manque.push("renseigner votre nom sur la page « Mon parcours »");
  if(!s.reussi) manque.push("obtenir au moins 16/20 à l'examen");
  if(!s.pratique) manque.push("déposer votre témoignage de foi agissante");
  return `<section class="panel" style="display:grid;gap:10px;border-color:var(--brass)"><div><p class="eyebrow" style="color:var(--brass)">Attestation</p><h2>Obtenir l'attestation du module</h2></div>
  ${manque.length ? `<p class="hint">Il vous reste à ${manque.join(", ")}.</p>` : `<p>Toutes les conditions sont remplies.</p>`}
  <div class="row"><button class="btn gold" type="button" id="delivrer" ${manque.length?"disabled":""}>Recevoir mon attestation</button></div></section>`;
}

function questionsHtml(qs, rep, fini, info){
  return qs.map((q,i)=>{
    const etat = fini ? (info.justes.has(q.cle) ? `<span class="pill ok">Juste</span>` : `<span class="pill bad">Faux</span>`) : "";
    return `<fieldset class="q"><legend>${i+1}. ${esc(q.q)} ${etat}</legend>
      ${q.choix.map((c,ci)=>{ let cls="";
        if(fini){ const bonne=info.bonnes && info.bonnes[q.cle];
          if(bonne!=null && c===bonne) cls="right"; else if(rep[i]===ci) cls = info.justes.has(q.cle) ? "right" : "wrong"; }
        return `<label class="opt ${cls}" for="q${i}-${ci}"><input type="radio" name="q${i}" id="q${i}-${ci}" value="${ci}" ${rep[i]===ci?"checked":""} ${fini?"disabled":""}><span>${esc(c)}</span></label>`; }).join("")}
      ${fini && info.expl && info.expl[q.cle] ? `<p class="hint">${esc(info.expl[q.cle])}</p>` : ""}
    </fieldset>`; }).join("");
}

function vExamen(){
  const m = findModule(S.moduleId), c = S.mods[S.moduleId];
  if(!S.exam) S.exam = { questions: shuffle(c.examen.map((q,qi)=>({cle:String(qi), q:q.q, choix: shuffle(q.choix)}))), rep:{}, fini:false, res:null, envoi:false };
  const E=S.exam, nbRep=Object.keys(E.rep).length;
  let res="";
  if(E.fini && E.res){
    const pass=E.res.score/E.res.total>=SEUIL;
    res = `<section class="panel score" style="border-color:${pass?"var(--ok)":"var(--bad)"}"><div class="big" style="color:${pass?"var(--ok)":"var(--bad)"}">${note20(E.res.score/E.res.total)}</div><div style="flex:1;min-width:200px"><h3>${pass?"Examen réussi !":"Pas encore : il faut au moins 16/20."}</h3><p class="hint">${E.res.score} bonnes réponses sur ${E.res.total}. ${pass?"Le module suivant est ouvert. Retournez au module pour recevoir votre attestation.":"Les questions manquées sont marquées en rouge. Relisez les leçons puis réessayez."}</p></div>
    <div class="row"><button class="btn primary" type="button" data-go="module">Retour au module</button>${pass?"":`<button class="btn" type="button" id="retry">Réessayer</button>`}</div></section>`;
  }
  const info = E.res ? {justes:new Set((E.res.justes||[]).map(String)), bonnes:E.res.bonnes, expl:E.res.explications} : null;
  return `<nav class="crumbs"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><button type="button" data-go="module">${esc(m.titre)}</button><span>›</span><span>Examen</span></nav>
  <section class="hero"><p class="eyebrow">Examen en ligne · ${E.questions.length} questions · noté sur 20</p><h1>${esc(m.titre)}</h1></section>
  ${res}
  ${E.fini?"":`<div class="counter" aria-live="polite">${nbRep} / ${E.questions.length} répondues</div>`}
  <form class="panel" id="exam-form">
    ${questionsHtml(E.questions, E.rep, E.fini, info)}
    ${E.fini?"":`<div class="row" style="padding-top:12px"><button class="btn primary" type="submit" ${E.envoi?"disabled":""}>${E.envoi?"Correction…":"Valider mes réponses"}</button><span class="hint" id="ex-hint"></span></div>`}
  </form>`;
}

// ----- test de passage -----
const PAR_PAGE = 10;
function vTest(){
  const n = S.prog.niveaux[S.niveauTest-1], T = S.test;
  const head = `<nav class="crumbs"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><span>Test de passage · Niveau ${S.niveauTest}</span></nav>
    <section class="hero"><p class="eyebrow">Test de passage · Niveau ${S.niveauTest}</p><h1>${esc(n.nom)} : ${esc(n.sousTitre)}</h1></section>`;
  if(!T) return head + `<section class="panel" style="display:grid;gap:12px">
    <p>Ce test vérifie que vous maîtrisez déjà le contenu de tout le niveau.</p>
    <ul><li><b>80 questions</b> tirées au hasard parmi celles des ${n.modules.length} modules du niveau.</li>
      <li>Noté <b>sur 20</b>. Avec <b>au moins 16/20</b>, vous recevez directement les ${n.modules.length} attestations du niveau et le niveau suivant s'ouvre.</li>
      <li>Vous avez <b>3 heures</b> pour le terminer, et au plus <b>3 essais par 24 heures</b>.</li>
      <li>Les corrections détaillées ne sont pas affichées, pour garder le test fiable.</li></ul>
    <div class="row"><button class="btn primary" type="button" id="start-test">Commencer le test</button><button class="btn" type="button" data-go="parcours">Annuler</button></div></section>`;
  if(T.chargement) return head + `<div class="empty">Préparation des questions…</div>`;
  if(T.res){ const ok=T.res.reussi; return head + `<section class="panel score" style="border-color:${ok?"var(--ok)":"var(--bad)"}"><div class="big" style="color:${ok?"var(--ok)":"var(--bad)"}">${String(T.res.note20).replace(".",",")}/20</div>
    <div style="flex:1;min-width:200px"><h3>${ok?"Test réussi ! Toutes les attestations du niveau vous sont délivrées.":"Pas encore : il faut au moins 16/20."}</h3><p class="hint">${T.res.bonnes} bonnes réponses sur ${T.res.total}. ${ok?(S.niveauTest<4?"Le niveau suivant est ouvert.":"Vous avez terminé le programme."):"Vous pouvez suivre les cours du niveau, ou réessayer plus tard."}</p></div>
    <div class="row"><button class="btn primary" type="button" data-go="parcours">Retour à mon parcours</button></div></section>`; }
  const tot=T.questions.length, pages=Math.ceil(tot/PAR_PAGE), p=T.page, debut=p*PAR_PAGE, nbRep=Object.keys(T.rep).length;
  const qs=T.questions.slice(debut, debut+PAR_PAGE);
  return head + `<div class="counter" aria-live="polite">${nbRep} / ${tot} répondues · page ${p+1} sur ${pages}</div>
    <div class="bar" style="--lc:var(--n${S.niveauTest})"><i style="width:${pct(nbRep,tot)}%"></i></div>
    <form class="panel" id="test-form">
      ${qs.map((q,j)=>{ const i=debut+j; return `<fieldset class="q"><legend>${i+1}. ${esc(q.q)}</legend>
        ${q.choix.map((c,ci)=>`<label class="opt" for="t${i}-${ci}"><input type="radio" name="t${i}" id="t${i}-${ci}" value="${ci}" ${T.rep[i]===ci?"checked":""}><span>${esc(c)}</span></label>`).join("")}</fieldset>`; }).join("")}
      <div class="row" style="padding-top:12px">
        ${p>0?`<button class="btn" type="button" data-page="${p-1}">Page précédente</button>`:""}
        ${p<pages-1?`<button class="btn primary" type="button" data-page="${p+1}">Page suivante</button>`:`<button class="btn primary" type="submit" ${T.envoi?"disabled":""}>${T.envoi?"Correction…":"Terminer et corriger"}</button>`}
        <span class="hint" id="t-hint"></span></div>
    </form>`;
}
async function demarrerTest(){
  const niv=S.niveauTest, n=S.prog.niveaux[niv-1];
  S.test={chargement:true}; render();
  try{
    const d = await rpc("demarrer_test",{p_niveau:niv});
    await Promise.all(n.modules.map(m=>getModule(m.id)));
    S.test = { id:d.id, page:0, rep:{}, res:null, envoi:false,
      questions: shuffle(d.questions).map(x=>{ const q=S.mods[x.m].examen[x.q]; return {cle:x.m+":"+x.q, q:q.q, choix:shuffle(q.choix)}; }) };
  }catch(e){ S.test=null; }
  render(); window.scrollTo({top:0});
}

function vEnseignant(){
  if(!S.profil || S.profil.role!=="enseignant") return `<div class="empty">Cet espace est réservé aux enseignants de la formation.</div>`;
  const mods = allModules();
  const list = S.etudiants.filter(e=>e.role!=="enseignant" || Object.keys(e.modules).length).slice().sort((a,b)=>(b.maj||"").localeCompare(a.maj||""));
  const nbCert = e => mods.filter(m=>statut(m,e).certifie).length;
  const moyE = e => { const v=mods.map(m=>statut(m,e).r.meilleur).filter(x=>x!=null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const totalCert = list.reduce((a,e)=>a+nbCert(e),0);
  const aNoter = list.reduce((a,e)=>a+mods.filter(m=>statut(m,e).pratique && !e.evaluations[m.id]).length,0);
  const sel = list.find(e=>e.id===S.selEtu);
  return `<section class="hero"><p class="eyebrow">Espace enseignant</p><h1>Suivi et notation des étudiants</h1><p class="lead">Ouvrez la fiche d'un étudiant pour lire ses témoignages de foi agissante et lui donner une note sur 20 avec une appréciation.</p><div class="row"><button class="btn small" type="button" id="refresh">Actualiser</button></div></section>
  <section class="stats"><div class="stat"><div class="v">${list.length}</div><div class="l">étudiants inscrits</div></div><div class="stat"><div class="v">${totalCert}</div><div class="l">attestations délivrées</div></div><div class="stat"><div class="v">${aNoter}</div><div class="l">témoignages à noter</div></div></section>
  ${list.length ? `<div class="tbl"><table><thead><tr><th>Étudiant</th><th>Église</th><th>Attestations</th><th>Moyenne examens</th><th>Tests de passage</th><th>Dernière activité</th><th></th></tr></thead><tbody>
    ${list.map(e=>{const m=moyE(e); const t=(e.tests||[]); return `<tr><td><b>${esc(e.nom||"Sans nom")}</b></td><td>${esc(e.eglise||"–")}</td><td>${nbCert(e)} / ${mods.length}</td><td>${m==null?"–":note20(m)}</td><td>${t.length?t.map(x=>`N${x.niveau} : ${String(x.note20).replace(".",",")}/20`).join("<br>"):"–"}</td><td>${e.maj?fmtDate(e.maj):"–"}</td><td><button class="btn small" type="button" data-etu="${esc(e.id)}">${S.selEtu===e.id?"Fermer":"Ouvrir"}</button></td></tr>`;}).join("")}
  </tbody></table></div>` : `<div class="panel empty">Aucun étudiant pour l'instant. Partagez l'adresse de la plateforme : chaque étudiant crée son compte et apparaît ici.</div>`}
  ${sel ? ficheEtu(sel) : ""}`;
}

function ficheEtu(e){
  const touched = allModules().filter(m=>{const s=statut(m,e); return s.tentatives||s.r.pratique||s.certifie;});
  return `<section class="panel" style="display:grid;gap:14px"><div><p class="eyebrow">Fiche étudiant</p><h2>${esc(e.nom||"Sans nom")}</h2><p class="hint">${[e.eglise, e.inscrit?"inscrit le "+fmtDate(e.inscrit):""].filter(Boolean).map(esc).join(" · ")}</p></div>
  ${touched.length ? touched.map(m=>{const s=statut(m,e), x=e.evaluations[m.id]||{}; return `<div class="panel" style="background:var(--surface2);display:grid;gap:8px">
    <div class="row" style="justify-content:space-between"><b>${esc(m.titre)}</b><span class="row" style="gap:6px">${s.r.meilleur!=null?`<span class="pill ${s.reussi?"ok":"bad"}">${s.parTest?"Test de passage":"Examen"} ${note20(s.r.meilleur)}${s.tentatives?` · ${s.tentatives} essai(s)`:""}</span>`:""}${s.certifie?`<span class="pill cert">N° ${esc(s.r.certNo)}</span>`:""}</span></div>
    <p class="hint">Niveau ${niveauIndex(m.niveau)} · ${esc(m.niveau.nom)}</p>
    ${s.r.pratique?`<div><b>Témoignage de foi agissante</b><p style="white-space:pre-wrap">${esc(s.r.pratique)}</p></div>`:`<p class="hint">Pas de témoignage.</p>`}
    <div class="row" style="align-items:flex-end">
      <label class="f" for="note-${m.id}" style="width:110px">Note /20<input type="text" inputmode="decimal" id="note-${m.id}" value="${esc(x.note??"")}"></label>
      <label class="f" for="com-${m.id}" style="flex:1;min-width:200px">Appréciation<input type="text" id="com-${m.id}" value="${esc(x.commentaire||"")}" maxlength="500"></label>
      <button class="btn small primary" type="button" data-noter="${m.id}">Enregistrer</button>
    </div></div>`;}).join("") : `<p class="hint">Cet étudiant n'a encore commencé aucun module.</p>`}
  </section>`;
}

// ---------- interactions ----------
async function apres(promesse, message){
  try{ await promesse; await chargerEtu(); if(message) toast(message); }catch(e){}
  render();
}
function bind(){
  $app.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>go("module",b.dataset.open));
  $app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  $app.querySelectorAll("[data-test]").forEach(b=>b.onclick=()=>{ S.niveauTest=+b.dataset.test; S.test=null; S.view="test"; render(); window.scrollTo({top:0}); });
  $app.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{ S.authMode=b.dataset.mode; render(); });
  $app.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ const i=document.getElementById(b.dataset.pw), voir=i.type==="password";
    i.type = voir ? "text" : "password"; b.textContent = voir ? "Masquer" : "Afficher"; b.setAttribute("aria-pressed", String(voir)); i.focus(); });
  $app.querySelectorAll("[data-lect]").forEach(cb=>cb.onchange=()=>{ const [k,j]=cb.id.slice(3).split("-"); S.lus[S.moduleId+k+"-"+j]=cb.checked;
    const det=cb.closest("details"); const tous=[...det.querySelectorAll("[data-lect]")].every(x=>x.checked);
    const btn=det.querySelector("[data-lu]"); if(btn) btn.disabled=!tous; });
  $app.querySelectorAll("[data-lu]").forEach(b=>b.onclick=()=>{ b.disabled=true; apres(rpc("marquer_lecon",{p_module:S.moduleId, p_lecon:+b.dataset.lu}),"Leçon terminée."); });
  $app.querySelectorAll("[data-pdf]").forEach(b=>b.onclick=()=>pdfModule(findModule(b.dataset.pdf)));
  $app.querySelectorAll("[data-diplome]").forEach(b=>b.onclick=()=>pdfNiveau(S.prog.niveaux.find(n=>n.id===b.dataset.diplome)));
  $app.querySelectorAll("[data-etu]").forEach(b=>b.onclick=()=>{ S.selEtu = S.selEtu===b.dataset.etu?null:b.dataset.etu; render(); });
  $app.querySelectorAll("[data-noter]").forEach(b=>b.onclick=()=>noter(b.dataset.noter));
  const rf=document.getElementById("refresh"); if(rf) rf.onclick=()=>chargerEnseignant().then(()=>{ render(); toast("Données actualisées."); });
  const st=document.getElementById("start-test"); if(st) st.onclick=demarrerTest;

  const af=document.getElementById("auth-form"); if(af) af.onsubmit=auth;
  const mf=document.getElementById("mdp-form"); if(mf) mf.onsubmit=async e=>{ e.preventDefault();
    const {error}=await S.sb.auth.updateUser({password:document.getElementById("n-mdp").value});
    if(error){ document.getElementById("n-msg").textContent=erreur(error); return; }
    S.recovery=false; toast("Mot de passe modifié."); go("parcours"); };
  const vf=document.getElementById("verif-form"); if(vf) vf.onsubmit=async e=>{ e.preventDefault();
    const out=document.getElementById("v-res");
    const {data,error}=await S.sb.rpc("verifier_attestation",{p_no:document.getElementById("v-no").value});
    if(error){ out.innerHTML=`<p class="hint">${esc(erreur(error))}</p>`; return; }
    if(!data){ out.innerHTML=`<div class="keep" style="background:var(--bad-soft);border-color:var(--bad)">Aucune attestation ne correspond à ce numéro.</div>`; return; }
    const m=findModule(data.module);
    out.innerHTML=`<div class="keep" style="background:var(--ok-soft);border-color:var(--ok)">Attestation authentique : <b>${esc(data.nom)}</b> a validé le module « ${esc(m?m.titre:data.module)} » ${data.origine==="test"?"par le test de passage du niveau ":""}avec ${note20(data.score)}, le ${fmtDate(data.date)}.</div>`; };

  const ps=document.getElementById("p-save");
  if(ps) ps.onclick=async()=>{ const nom=document.getElementById("p-nom").value.trim(); if(nom.length<3){ toast("Indiquez votre nom complet."); return; }
    const {error}=await S.sb.from("profils").update({nom, eglise:document.getElementById("p-eglise").value.trim()}).eq("id",S.session.user.id);
    if(error){ toast(erreur(error)); return; } apres(Promise.resolve(),"Fiche enregistrée."); };
  const ta=document.getElementById("pratique");
  if(ta){ const c=document.getElementById("pr-count"); const upd=()=>{ const n=ta.value.trim().length; c.textContent = n<MIN_PRATIQUE ? `${n} / ${MIN_PRATIQUE} caractères minimum` : `${n} caractères`; }; ta.oninput=upd; upd();
    document.getElementById("save-pratique").onclick=()=>apres(rpc("enregistrer_pratique",{p_module:S.moduleId, p_texte:ta.value}),"Témoignage enregistré."); }
  const dv=document.getElementById("delivrer");
  if(dv) dv.onclick=()=>{ dv.disabled=true; apres(rpc("delivrer_attestation",{p_module:S.moduleId}),"Attestation délivrée. Vous pouvez la télécharger."); };

  const f=document.getElementById("exam-form");
  if(f && S.exam && !S.exam.fini){
    f.onchange=e=>{ const t=e.target; if(t.name&&t.name.startsWith("q")){ S.exam.rep[+t.name.slice(1)]=+t.value; const c=document.querySelector(".counter"); if(c) c.textContent=`${Object.keys(S.exam.rep).length} / ${S.exam.questions.length} répondues`; } };
    f.onsubmit=async e=>{ e.preventDefault(); const E=S.exam;
      if(Object.keys(E.rep).length<E.questions.length){ document.getElementById("ex-hint").textContent=`Répondez à toutes les questions avant de valider (${E.questions.length-Object.keys(E.rep).length} restantes).`; return; }
      const reponses={}; E.questions.forEach((q,i)=>{ reponses[q.cle]=q.choix[E.rep[i]]; });
      E.envoi=true; render();
      try{ E.res=await rpc("soumettre_examen",{p_module:S.moduleId, p_reponses:reponses}); E.fini=true; await chargerEtu(); }
      catch(err){ E.envoi=false; }
      render(); window.scrollTo({top:0}); };
  }
  const rt=document.getElementById("retry"); if(rt) rt.onclick=()=>{ S.exam=null; render(); window.scrollTo({top:0}); };

  const tf=document.getElementById("test-form");
  if(tf && S.test){
    const T=S.test, maj=()=>{ const c=document.querySelector(".counter"), n=Object.keys(T.rep).length; if(c) c.textContent=`${n} / ${T.questions.length} répondues · page ${T.page+1} sur ${Math.ceil(T.questions.length/PAR_PAGE)}`; const b=document.querySelector(".bar>i"); if(b) b.style.width=pct(n,T.questions.length)+"%"; };
    tf.onchange=e=>{ const t=e.target; if(t.name&&t.name.startsWith("t")){ T.rep[+t.name.slice(1)]=+t.value; maj(); } };
    tf.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{ T.page=+b.dataset.page; render(); window.scrollTo({top:0}); });
    tf.onsubmit=async e=>{ e.preventDefault();
      const manque=T.questions.length-Object.keys(T.rep).length;
      if(manque){ const p=T.questions.findIndex((_,i)=>T.rep[i]==null); document.getElementById("t-hint").textContent=`Il reste ${manque} question(s) sans réponse (la première est à la page ${Math.floor(p/PAR_PAGE)+1}).`; return; }
      const reponses={}; T.questions.forEach((q,i)=>{ reponses[q.cle]=q.choix[T.rep[i]]; });
      T.envoi=true; render();
      try{ T.res=await rpc("soumettre_test",{p_test:T.id, p_reponses:reponses}); await chargerEtu(); }catch(err){ T.envoi=false; }
      render(); window.scrollTo({top:0}); };
  }
}

async function auth(e){
  e.preventDefault();
  const msg=document.getElementById("a-msg"), email=document.getElementById("a-email").value.trim();
  const mdp=document.getElementById("a-mdp")?.value||"";
  msg.textContent="Un instant…";
  try{
    if(S.authMode==="connexion"){
      const {error}=await S.sb.auth.signInWithPassword({email, password:mdp}); if(error) throw error; msg.textContent="";
    }else if(S.authMode==="inscription"){
      const nom=document.getElementById("a-nom").value.trim(), eglise=document.getElementById("a-eglise").value.trim();
      if(nom.length<3){ msg.textContent="Indiquez votre nom complet."; return; }
      const {data,error}=await S.sb.auth.signUp({email, password:mdp, options:{data:{nom, eglise}, emailRedirectTo:location.origin}});
      if(error) throw error;
      if(!data.session) msg.textContent="Compte créé. Ouvrez l'e-mail que nous venons de vous envoyer et cliquez sur le lien pour l'activer.";
    }else{
      const {error}=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin}); if(error) throw error;
      msg.textContent="Si un compte existe pour cette adresse, un lien vient d'être envoyé.";
    }
  }catch(err){ msg.textContent=erreur(err); }
}

async function noter(mid){
  const e=S.etudiants.find(x=>x.id===S.selEtu); if(!e) return;
  const raw=document.getElementById("note-"+mid).value.trim().replace(",",".");
  const note = raw==="" ? null : Number(raw);
  if(raw!=="" && (isNaN(note)||note<0||note>20)){ toast("La note doit être comprise entre 0 et 20."); return; }
  const {error}=await S.sb.from("progression").update({note, commentaire:document.getElementById("com-"+mid).value.trim()||null, date_eval:new Date().toISOString()}).eq("user_id",e.id).eq("module_id",mid);
  if(error){ toast(erreur(error)); return; }
  await chargerEnseignant(); render(); toast("Appréciation enregistrée.");
}

// ---------- PDF ----------
const pdfTxt = s => String(s).replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/œ/g,"oe").replace(/Œ/g,"OE").replace(/[—–]/g,"-").replace(/…/g,"...").replace(/ /g," ");
function cadre(doc, couleur){
  const W=297,H=210; doc.setFillColor(252,250,244); doc.rect(0,0,W,H,"F");
  doc.setDrawColor(...couleur); doc.setLineWidth(2.2); doc.rect(10,10,W-20,H-20);
  doc.setLineWidth(0.5); doc.rect(14,14,W-28,H-28);
  doc.setFillColor(27,42,78); doc.circle(W/2,33,10,"F");
  doc.setDrawColor(...couleur); doc.setLineWidth(1.6); doc.line(W/2,27,W/2,40); doc.line(W/2-4.5,31,W/2+4.5,31);
}
function piedPdf(doc, no, date){
  const W=297; doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(90,96,120);
  doc.text(pdfTxt("Délivrée le "+fmtDate(date)),40,178); doc.text(pdfTxt("N° "+no),40,184);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.3); doc.line(W-110,176,W-40,176);
  doc.text("Le responsable de la formation",W-75,182,{align:"center"});
  doc.setFontSize(8.5); doc.text(pdfTxt("Programme Héro de la Foi - vérification : "+location.host+"/#verifier"),W/2,193,{align:"center"});
}
function nomFichier(s){ return pdfTxt(s).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"-"); }
async function pdfModule(m){
  if(!window.jspdf){ toast("Le module PDF n'a pas pu se charger. Rechargez la page."); return; }
  const s=statut(m), i=niveauIndex(m.niveau), W=297;
  const doc=new jspdf.jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  cadre(doc,[168,123,31]);
  doc.setTextColor(27,42,78); doc.setFont("times","bold"); doc.setFontSize(30); doc.text("ATTESTATION DE RÉUSSITE",W/2,62,{align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(12); doc.setTextColor(90,96,120);
  doc.text(pdfTxt("Formation Héro de la Foi - Niveau "+i+" : "+m.niveau.nom),W/2,71,{align:"center"});
  doc.setFontSize(13); doc.text("est décernée à",W/2,88,{align:"center"});
  doc.setFont("times","bold"); doc.setFontSize(28); doc.setTextColor(20,27,46); doc.text(pdfTxt(S.etu.nom),W/2,103,{align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(12.5); doc.setTextColor(40,44,60);
  const texte = s.parTest
    ? `pour avoir validé le module « ${m.titre} » par le test de passage du niveau, avec la note de ${note20(s.r.meilleur)}.`
    : `pour avoir suivi avec succès le module « ${m.titre} », réussi l'examen avec la note de ${note20(s.r.meilleur)} et mis sa foi en pratique.`;
  doc.text(doc.splitTextToSize(pdfTxt(texte),200),W/2,118,{align:"center"});
  if(S.etu.eglise){ doc.setFontSize(11); doc.setTextColor(90,96,120); doc.text(pdfTxt(S.etu.eglise),W/2,138,{align:"center"}); }
  doc.setFont("times","italic"); doc.setFontSize(11.5); doc.setTextColor(120,90,30);
  doc.text(pdfTxt("« Ainsi en est-il de la foi : si elle n'a pas les oeuvres, elle est morte en elle-même. » Jacques 2.17"),W/2,155,{align:"center"});
  piedPdf(doc, s.r.certNo, s.r.certDate);
  doc.save(`Attestation-${m.id.toUpperCase()}-${nomFichier(S.etu.nom)}.pdf`);
}
async function pdfNiveau(n){
  if(!window.jspdf){ toast("Le module PDF n'a pas pu se charger. Rechargez la page."); return; }
  const i=niveauIndex(n), W=297;
  const sc=n.modules.map(m=>statut(m).r.meilleur||0), moy=sc.reduce((a,b)=>a+b,0)/sc.length;
  const certs=n.modules.map(m=>statut(m).r), last=certs.map(r=>r.certDate).sort().pop();
  const doc=new jspdf.jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  cadre(doc,[168,123,31]);
  doc.setTextColor(27,42,78); doc.setFont("times","bold"); doc.setFontSize(32); doc.text("DIPLÔME",W/2,60,{align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(13); doc.setTextColor(90,96,120);
  doc.text(pdfTxt("Niveau "+i+" - "+n.nom+" : "+n.sousTitre),W/2,70,{align:"center"});
  doc.text("est décerné à",W/2,86,{align:"center"});
  doc.setFont("times","bold"); doc.setFontSize(28); doc.setTextColor(20,27,46); doc.text(pdfTxt(S.etu.nom),W/2,101,{align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(12); doc.setTextColor(40,44,60);
  doc.text(doc.splitTextToSize(pdfTxt(`qui a validé les ${n.modules.length} modules du niveau avec une moyenne de ${note20(moy)}.`),210),W/2,115,{align:"center"});
  doc.setFontSize(9.5); doc.setTextColor(90,96,120);
  doc.text(doc.splitTextToSize(pdfTxt(n.modules.map(m=>m.titre).join(" · ")),230),W/2,132,{align:"center"});
  doc.setFont("times","italic"); doc.setFontSize(11); doc.setTextColor(120,90,30);
  doc.text(doc.splitTextToSize(pdfTxt(n.verset),230),W/2,152,{align:"center"});
  piedPdf(doc, "Attestations " + certs.map(r=>r.certNo).join(", ").slice(0,90), last);
  doc.save(`Diplome-Niveau${i}-${nomFichier(S.etu.nom)}.pdf`);
}

// ---------- démarrage ----------
async function demarrer(){
  try{
    const [prog, cfg] = await Promise.all([fetch("programme.json").then(r=>r.json()), fetch("/api/config").then(r=>r.ok?r.json():{}).catch(()=>({}))]);
    S.prog = prog;
    if(!cfg.url || !cfg.anonKey || !window.supabase){
      $app.innerHTML = `<div class="panel" style="display:grid;gap:8px"><h2>Configuration incomplète</h2><p>La plateforme ne trouve pas la connexion à la base de données. Dans Vercel, ajoutez les variables <b>SUPABASE_URL</b> et <b>SUPABASE_ANON_KEY</b>, puis redéployez.</p></div>`;
      return;
    }
    S.sb = supabase.createClient(cfg.url, cfg.anonKey);
    S.sb.auth.onAuthStateChange((event, session)=>{ setTimeout(()=>surSession(event, session), 0); });
    async function surSession(event, session){
      if(event==="PASSWORD_RECOVERY") S.recovery=true;
      const avant = S.session && S.session.user.id;
      S.session = session;
      if(session && session.user.id!==avant){
        try{ await chargerEtu(); }catch(e){ toast(erreur(e)); }
        if(S.view==="enseignant") await chargerEnseignant();
      }
      if(!session){ S.etu={nom:"",eglise:"",modules:{},lecons:{},evaluations:{}}; S.profil=null; S.etudiants=[]; S.selEtu=null; S.exam=null; S.test=null; if(S.view!=="verifier") S.view="parcours"; try{ history.replaceState(null,"",location.pathname); }catch(e){} }
      render();
    }
    const {data} = await S.sb.auth.getSession();
    S.session = data.session;
    fromHash();
    if(S.session){ await chargerEtu(); if(S.view==="enseignant") await chargerEnseignant(); }
    if(S.view==="module" && S.session) await go("module"); else render();
  }catch(e){
    $app.innerHTML = '<div class="empty">La plateforme n\'a pas pu démarrer. Rechargez la page.</div>';
  }
}
window.addEventListener("hashchange",()=>{ if(!S.prog||!S.session&&location.hash!=="#verifier") { if(location.hash==="#verifier"){ S.view="verifier"; render(); } return; } fromHash(); if(S.view==="module") go("module"); else { if(S.view==="enseignant") chargerEnseignant().then(render); render(); } });
demarrer();
})();
