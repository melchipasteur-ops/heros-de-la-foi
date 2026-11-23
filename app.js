(function(){
"use strict";
const {SEUIL, MIN_PRATIQUE, esc, pct, note20, fmtDate, toast, shuffle, erreur, etuDepuis} = HDF;
const $app = document.getElementById("app");
const S = {
  prog:null, mods:{}, view:"parcours", moduleId:null, exam:null, test:null, niveauTest:null,
  sb:null, session:null, profil:null, recovery:false, authMode:"connexion",
  etu:{nom:"", eglise:"", modules:{}, lecons:{}, etapes:{}, evaluations:{}, tests:[]},
  suivi:null, lus:{}, lecon:null, pleinePage:false
};
let R = null;   // règles de progression, créées quand programme.json est chargé
const allModules = () => R.allModules();
const findModule = id => R.findModule(id);
const niveauIndex = n => R.niveauIndex(n);
const statut = (m, etu) => R.statut(m, etu || S.etu);
const niveauFini = (n, etu) => R.niveauFini(n, etu || S.etu);
const niveauValide = (n, etu) => R.niveauValide(n, etu || S.etu);
const niveauOuvert = (n, etu) => R.niveauOuvert(n, etu || S.etu);
const moduleOuvert = (m, etu) => R.moduleOuvert(m, etu || S.etu);
const precedent = m => R.precedent(m);
async function getModule(id){
  if(!S.mods[id]) S.mods[id] = await fetch("modules/"+id+".json").then(r=>{ if(!r.ok) throw new Error("Module introuvable"); return r.json(); });
  return S.mods[id];
}

// ---------- données Supabase ----------
async function chargerEtu(){
  const uid = S.session.user.id;
  const [p, g, t, su, ph] = await Promise.all([
    S.sb.from("profils").select("*").eq("id",uid).maybeSingle(),
    S.sb.from("progression").select("*").eq("user_id",uid),
    S.sb.from("tests_passage").select("*").eq("user_id",uid).not("fin","is",null),
    S.sb.rpc("mon_suivi"),
    S.sb.from("photos").select("image").eq("user_id",uid).maybeSingle()
  ]);
  if(p.error) throw p.error; if(g.error) throw g.error;
  S.profil = p.data || {id:uid, nom:"", eglise:"", role:"etudiant"};
  S.etu = etuDepuis(S.profil, g.data||[], t.data||[]);
  S.suivi = su.error ? null : su.data;
  S.photo = (ph && !ph.error && ph.data) ? ph.data.image : null;
  // Test de passage réussi mais attestations manquantes (module ajouté après le test) : rattrapage côté serveur
  const manque = (t.data||[]).filter(x=>x.reussi).some(x=>{ const n=S.prog.niveaux[x.niveau-1]; return n && n.modules.some(m=>!statut(m).certifie); });
  if(manque && !S._rattrapage){ S._rattrapage=true; const r=await S.sb.rpc("rattraper_attestations"); if(!r.error && r.data>0){ toast(`${r.data} attestation(s) délivrée(s) grâce à votre test de passage.`); return chargerEtu(); } }
}
async function rpc(fn, args){
  const {data, error} = await S.sb.rpc(fn, args);
  if(error){ toast(erreur(error)); throw error; }
  return data;
}

// ---------- navigation ----------
async function go(view, moduleId, lecon){
  if(moduleId!==undefined && moduleId!==null) S.moduleId=moduleId;
  if(view==="module"||view==="examen"||view==="lecon"){
    const m=findModule(S.moduleId);
    if(!m){ view="parcours"; }
    else if(!moduleOuvert(m)){ const p=precedent(m); toast(`Module verrouillé. Obtenez d'abord au moins 16/20 au module « ${p.titre} », ou réussissez le test de passage du niveau.`); return; }
    else if(!S.mods[m.id]){ S.view="chargement"; render(); try{ await getModule(m.id); }catch(e){ toast("Le module n'a pas pu être chargé."); view="parcours"; } }
  }
  if(view==="lecon"){
    const c=S.mods[S.moduleId], k=lecon!=null?lecon:(S.lecon?S.lecon.k:0);
    if(!c || !c.lecons[k]) view="module";
    else if(!S.lecon || S.lecon.k!==k || S.lecon.mid!==S.moduleId){ S.lecon={mid:S.moduleId, k, etape:etapeDeReprise(S.moduleId,k)}; }
  }
  if(view==="examen"){ const m=findModule(S.moduleId); if(!statut(m).leconsFinies){ toast("Terminez d'abord toutes les leçons et leurs lectures obligatoires."); view="module"; } }
  S.view=view;
  if(view!=="examen") S.exam=null;
  if(view!=="test") S.test=null;
  if(view!=="lecon") S.pleinePage=false;
  const h = view==="lecon" ? "m-"+S.moduleId+"-l"+S.lecon.k : view==="module"||view==="examen" ? "m-"+S.moduleId : view;
  if(location.hash!=="#"+h){ try{ history.replaceState(null,"","#"+h); }catch(e){} }
  render(); window.scrollTo({top:0});
}
function fromHash(){
  const h=(location.hash||"").slice(1), x=h.match(/^m-(n\dm\d+)(?:-l(\d+))?$/);
  if(x && findModule(x[1])){ S.moduleId=x[1]; if(x[2]!=null){ S.view="lecon"; S._leconHash=+x[2]; } else S.view="module"; }
  else if(["parcours","programme","verifier"].includes(h)) S.view=h;
  else if(h.startsWith("verifier=")){ S.view="verifier"; try{ S.verifNo=decodeURIComponent(h.slice(9)); }catch(e){ S.verifNo=h.slice(9); } }
}
async function allerDepuisHash(){ if(S.view==="lecon"){ const k=S._leconHash; S.lecon=null; await go("lecon", null, k); } else if(S.view==="module") await go("module"); else render(); }
document.getElementById("brand").onclick=()=>go(S.session?"parcours":"connexion");
document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.onclick=()=>go(b.dataset.view));
document.getElementById("logout").onclick=async()=>{ S.authMode="connexion"; await S.sb.auth.signOut(); };

// ---------- rendu ----------
function render(){
  if(!S.prog) return;
  document.getElementById("nav").hidden = !S.session || S.recovery;
  document.querySelectorAll("nav.tabs button[data-view]").forEach(b=>b.setAttribute("aria-current", b.dataset.view===S.view || (b.dataset.view==="parcours" && ["module","examen","test","lecon"].includes(S.view)) ? "page":"false"));
  let html;
  if(S.view==="verifier") html=vVerifier();
  else if(S.recovery) html=vNouveauMdp();
  else if(!S.session) html=vAuth();
  else if(S.view==="chargement") html=`<div class="empty">Chargement du cours…</div>`;
  else if((S.view==="module"||S.view==="lecon") && !S.mods[S.moduleId]){ go(S.view); html=`<div class="empty">Chargement du cours…</div>`; }
  else html = ({parcours:vParcours, programme:vProgramme, module:vModule, lecon:vEtapes, examen:vExamen, test:vTest}[S.view] || vParcours)();
  $app.innerHTML = html;
  bind();
}

function vAuth(){
  const m=S.authMode;
  return `<section class="hero"><p class="eyebrow">Programme de formation biblique</p><h1>De la conversion à la maturité&nbsp;: devenir un héros de la foi</h1>
    <p class="lead">Quatre niveaux, ${allModules().length} modules découpés en petites étapes, des jeux pour apprendre, des examens en ligne et une attestation pour chaque module réussi. Créez votre compte pour commencer, ou connectez-vous pour reprendre votre parcours.</p></section>
  <form class="panel auth" id="auth-form" novalidate>
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-mode="connexion" aria-selected="${m==="connexion"}">Se connecter</button>
      <button type="button" role="tab" data-mode="inscription" aria-selected="${m==="inscription"}">Créer un compte</button>
    </div>
    ${m==="inscription" ? `<label class="f" for="a-nom">Nom complet <span class="hint">(il figurera sur vos attestations)</span><input type="text" id="a-nom" autocomplete="name" maxlength="80" required></label>
      <label class="f" for="a-eglise">Église ou assemblée <span class="hint">(facultatif)</span><input type="text" id="a-eglise" maxlength="80"></label>` : ""}
    ${HDF.champIdentifiant("a")}
    ${m==="oubli" && HDF.modeIdentifiant()==="tel" ? `<p class="hint">Pour un compte créé avec un numéro de téléphone, contactez le responsable de la formation au <b>${esc(HDF.INSTITUTION.telephone)}</b> (appel ou WhatsApp) : il réinitialisera votre mot de passe.</p>` : m!=="oubli" ? `<label class="f" for="a-mdp">Mot de passe<span class="pw"><input type="password" id="a-mdp" autocomplete="${m==="inscription"?"new-password":"current-password"}" minlength="6" required><button type="button" class="pw-btn" data-pw="a-mdp" aria-controls="a-mdp" aria-pressed="false">Afficher</button></span></label>` : `<p class="hint">Nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>`}
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
  <form class="panel auth" id="verif-form"><label class="f" for="v-no">Numéro d'attestation<input type="text" id="v-no" maxlength="400" required></label>
  <div class="row"><button class="btn primary" type="submit">Vérifier</button><a class="btn small" href="#parcours">Retour</a></div><div id="v-res"></div></form>`;
}

function suiviHtml(){
  const su=S.suivi; if(!su || (!su.enseignant && !(su.messages||[]).length)) return "";
  return `<section class="panel suivi"><p class="eyebrow">Mon accompagnement</p>${su.enseignant?`<h3>Votre enseignant : ${esc(su.enseignant)}</h3>`:""}
    ${(su.messages||[]).slice(0,3).map(x=>`<div class="msg"><p>${esc(x.texte)}</p><p class="hint">${esc(x.auteur||"Votre enseignant")} · ${fmtDate(x.date)}</p></div>`).join("")}</section>`;
}
// Test de passage terminé sous 16/20 et non effacé par un enseignant : il faut suivre les cours du niveau
function testBloque(i){ return (S.etu.tests||[]).some(t=>t.niveau===i && t.fin && !t.reussi && t.compte!==false); }
function premierModuleAFaire(i){ const n=S.prog.niveaux[i-1]; return n && (n.modules.find(m=>moduleOuvert(m) && !statut(m).certifie) || n.modules[0]); }
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
  ${suiviHtml()}
  ${!identiteOk() ? profilForm() : ""}
  <section class="levels">${S.prog.niveaux.map(levelCard).join("")}</section>
  ${identiteOk() ? profilForm() : ""}`;
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
      : ouvert && !niveauValide(n) ? (testBloque(i) ? `<p class="hint">Test de passage non réussi : suivez les cours de ce niveau, module après module. Votre enseignant peut vous autoriser un nouveau test.</p>` : `<button class="btn" type="button" data-test="${i}">Passer le test de passage du niveau (80 questions)</button>`) : ""}
  </article>`;
}

function vProgramme(){
  return `<section class="hero"><p class="eyebrow">Plan de formation</p><h1>Le programme complet</h1>
    <p class="lead">Le parcours suit la croissance d'un croyant : naître de nouveau, grandir dans tous les domaines de la vie, servir, puis conduire et former d'autres.</p></section>
    <section class="panel"><h3>Comment fonctionne un module</h3>
    <div class="steps" style="margin-top:12px">
      <div class="step"><b>1. Lire</b>Les passages bibliques obligatoires de chaque leçon</div>
      <div class="step"><b>2. Étudier pas à pas</b>Récit biblique, exégèse, enseignement, application et jeux, en petites étapes</div>
      <div class="step"><b>3. Agir</b>Une mise en pratique de la foi, décrite par écrit</div>
      <div class="step"><b>4. Examen</b>20 questions, au moins 16/20 pour ouvrir le module suivant</div>
      <div class="step"><b>5. Attestation</b>Un PDF numéroté, puis un diplôme par niveau</div>
    </div>
    <p class="hint" style="margin-top:12px">Test de passage : 80 questions tirées au hasard dans tout le niveau, notées sur 20, à faire en 25 minutes. Avec au moins 16/20, toutes les attestations du niveau sont délivrées et le niveau suivant s'ouvre. Trois essais au plus par 24 heures.</p></section>
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
function vLecon(m, l, k, ouvert){
  const lu=(S.etu.lecons||{})[m.id+"-"+k];
  const lectures=l.lectures||[];
  const cocher = !lu && lectures.length;
  const premiere = (m.lecons||[]).findIndex((_,i)=>!(S.etu.lecons||{})[m.id+"-"+i]);
  return `<details class="lesson" ${k===premiere||ouvert?"open":""}>
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

// ----- illustrations -----
const IMAGES = ["bible","croix","priere","colombe","eglise","chemin","chaines","lumiere","bouclier","famille","arbre","coeur","balance","eau","couronne","mains","berger","lampe","porte","semence"];
const MOTS_IMAGES = [[/alliance|délivr|libert|liens/i,"chaines"],[/ténèbres|lumière|témoign/i,"lumiere"],[/pri(è|e)re|prier|intercession|jeûne/i,"priere"],[/esprit/i,"colombe"],
  [/église|communauté|frères|assemblée/i,"eglise"],[/bible|parole|écriture/i,"bible"],[/croix|salut|pardon|sang|grâce|rédemption/i,"croix"],[/baptême|eau|purif/i,"eau"],
  [/famille|mariage|enfant|parent|couple/i,"famille"],[/servi|service|dons?\b|générosité/i,"mains"],[/berger|pasteur|discipl|accompagn/i,"berger"],
  [/combat|tentation|armure|ennemi|résist/i,"bouclier"],[/cœur|amour|émotion/i,"coeur"],[/croissance|fruit|caractère|grandir/i,"arbre"],
  [/argent|justice|éthique|sagesse|équilibre|péché/i,"balance"],[/vision|leader|conduire|autorité|récompense|gloire/i,"couronne"],
  [/mission|évangél|semer|semence/i,"semence"],[/chemin|marche|voie|appel|vocation/i,"chemin"],[/nouvelle|naissance|porte|commencement/i,"porte"],[/lampe|conscience|discern/i,"lampe"]];
function illustrationLecon(l, k){
  if(l.illustration && IMAGES.includes(l.illustration)) return l.illustration;
  const t = l.titre + " " + ((l.recit||{}).titre||"");
  for(const [re, nom] of MOTS_IMAGES) if(re.test(t)) return nom;
  return IMAGES[(t.length + k) % IMAGES.length];
}
const img = (nom, cls) => `<img class="${cls||"illus"}" src="images/${esc(nom)}.svg" alt="" loading="lazy" width="320" height="200">`;
const motsDe = s => String(s||"").split(/\s+/).filter(Boolean).length;
const texteDe = arr => (arr||[]).map(x=>typeof x==="string"?x:(x.titre||"")+" "+(x.paragraphes||[]).join(" ")).join(" ");

// ----- découpage d'une leçon en petites étapes (tout le contenu est conservé) -----
function etapesLecon(m, l, k){
  const E=[], ill=illustrationLecon(l,k);
  const add=(type, titre, image, html, texte)=>E.push({type, titre, image, html, min:Math.max(1, Math.round(motsDe(texte)/170))});
  const lu=(S.etu.lecons||{})[m.id+"-"+k], lectures=l.lectures||[];
  if(lectures.length) add("lectures", "Ouvre ta Bible", "bible",
    `<p>Commence par lire ces passages dans ta Bible. Prends ton temps : c'est Dieu qui te parle. Coche chaque passage quand tu l'as lu.</p>
    <ul class="checks">${lectures.map((x,j)=>`<li><label for="lu-${k}-${j}"><input type="checkbox" id="lu-${k}-${j}" data-lect2="${j}" ${lu||S.lus[m.id+k+"-"+j]?"checked":""} ${lu?"disabled":""}><span><b>${esc(x.ref)}</b>${x.resume?` : ${esc(x.resume)}`:""}</span></label></li>`).join("")}</ul>`,
    lectures.map(x=>x.resume).join(" "));
  if(l.recit) add("recit", l.recit.titre, ill,
    `<p class="eyebrow">Récit biblique · ${esc(l.recit.ref)}</p><div class="block story">${paras(l.recit.paragraphes)}</div>
    ${(l.recit.lecons||[]).length?`<div class="keep">Ce que ce récit nous enseigne<ul>${l.recit.lecons.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}`,
    (l.recit.paragraphes||[]).join(" "));
  const ex=l.exegese||[];
  ex.forEach((x,i)=>add("exegese", `Comprendre le texte${ex.length>1?` (${i+1}/${ex.length})`:""}`, "lampe", `<p class="eyebrow">Exégèse</p>${sections([x])}`, texteDe([x])));
  if((l.motsCles||[]).length) add("mots", "Les mots de la Bible", "semence",
    `<p>La Bible a été écrite en hébreu et en grec. Voici quelques mots clés et leur sens d'origine.</p>
    <div class="words">${l.motsCles.map(w=>`<div class="word"><b>${esc(w.mot)}</b> <span class="hint">${esc(w.langue)} · <i>${esc(w.original)}</i></span><p>${esc(w.sens)}</p></div>`).join("")}</div>
    ${l.motsCles.length>=2?jeu("associer", l.motsCles):""}`, texteDe(l.motsCles.map(w=>w.sens)));
  const en=l.enseignement||[];
  en.forEach((x,i)=>add("enseignement", x.titre || `Enseignement${en.length>1?` (${i+1}/${en.length})`:""}`, i===0?ill:IMAGES[(i*7+k)%IMAGES.length], `<p class="eyebrow">Enseignement biblique${en.length>1?` · ${i+1}/${en.length}`:""}</p>${sections([{...x, titre:""}])}`, texteDe([x])));
  if((l.citations||[]).length) add("citations", "Les versets clés", "bible",
    (l.citations||[]).map(c=>`<blockquote><p>${esc(c.texte)}</p><cite>${esc(c.ref)} (Louis Segond 1910)</cite></blockquote>`).join(""), l.citations.map(c=>c.texte).join(" "));
  const ap=l.application||[];
  for(let i=0;i<ap.length;i+=2){ const g=ap.slice(i,i+2), n=Math.ceil(ap.length/2);
    add("application", `Dans ma vie aujourd'hui${n>1?` (${i/2+1}/${n})`:""}`, "mains", `<p class="eyebrow">Dans notre monde aujourd'hui</p>${sections(g)}`, texteDe(g)); }
  if(l.etudeDeCas || (l.reflexion||[]).length) add("cas", "Étude de cas", "porte",
    `${l.etudeDeCas?`<div class="block case"><p>${esc(l.etudeDeCas.situation)}</p><ol>${(l.etudeDeCas.questions||[]).map(q=>`<li>${esc(q)}</li>`).join("")}</ol></div>`:""}
    ${(l.reflexion||[]).length?`<div class="block"><p class="eyebrow">Pour réfléchir personnellement</p><ul>${l.reflexion.map(q=>`<li>${esc(q)}</li>`).join("")}</ul></div>`:""}`,
    (l.etudeDeCas?l.etudeDeCas.situation:"")+" "+(l.reflexion||[]).join(" "));
  const J=l.jeux||{};
  if((J.vraiFaux||[]).length) add("jeu", "Jeu : vrai ou faux ?", "couronne", `<p>Lis chaque phrase et choisis : vrai ou faux ? Tu verras tout de suite l'explication.</p>${jeu("vraiFaux", J.vraiFaux)}`, "");
  if(J.tri && (J.tri.elements||[]).length) add("jeu", "Jeu : classe les situations", "balance", `<p>${esc(J.tri.consigne||"Classe chaque situation dans la bonne catégorie.")}</p>${jeu("tri", J.tri)}`, "");
  add("fin", "À retenir et à mémoriser", "coeur",
    `${(l.retenir||[]).length?`<div class="keep">À retenir<ul>${l.retenir.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}
    ${l.memoriser?`<div class="block memo"><p class="eyebrow">Verset à mémoriser · ${esc(l.memoriser.ref)}</p><p class="verse">${esc(l.memoriser.texte)}</p>${jeu("verset", l.memoriser)}</div>`:""}
    ${l.priere?`<p class="verse"><b>Prière :</b> ${esc(l.priere)}</p>`:""}`, (l.retenir||[]).join(" "));
  return E;
}
const cleEtape = (mid,k) => "hdf-etape-"+mid+"-"+k;
// Retour obligatoire au cours : on repart de la première étape de chaque leçon, lectures à recocher
function recommencerCours(mid){
  const c=S.mods[mid]; (c?c.lecons:[]).forEach((_,k)=>{ try{ localStorage.removeItem(cleEtape(mid,k)); }catch(e){} });
  Object.keys(S.lus).forEach(x=>{ if(x.startsWith(mid)) delete S.lus[x]; });
  S.lecon=null;
}
function etapeDeReprise(mid, k){
  let v=null; try{ v=localStorage.getItem(cleEtape(mid,k)); }catch(e){}
  if(v!=null && !isNaN(+v)) return +v;
  const s=(S.etu.etapes||{})[mid+"-"+k]; return s ? Math.max(0, s.atteinte-1) : 0;
}
function lecturesCochees(m, l, k){ return (S.etu.lecons||{})[m.id+"-"+k] || (l.lectures||[]).every((_,j)=>S.lus[m.id+k+"-"+j]); }

function vEtapes(){
  const m=findModule(S.moduleId), c=S.mods[S.moduleId]; if(!m||!c||!S.lecon) return vModule();
  const k=S.lecon.k, l=c.lecons[k], i=niveauIndex(m.niveau), lu=(S.etu.lecons||{})[m.id+"-"+k];
  if(S.pleinePage) return `<nav class="crumbs" aria-label="Fil d'Ariane"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><button type="button" data-go="module">${esc(m.titre)}</button><span>›</span><span>Leçon ${k+1} en entier</span></nav>
    <div class="row"><button class="btn" type="button" id="mode-etapes">Revenir aux petites étapes</button></div>${vLecon(m,l,k,true)}`;
  JEUX.length=0;
  const E=etapesLecon(m,l,k); S.lecon.etape=Math.min(Math.max(0,S.lecon.etape), E.length-1);
  const e=S.lecon.etape, st=E[e], srv=(S.etu.etapes||{})[m.id+"-"+k], atteinte=Math.max(srv?srv.atteinte:0, e+1);
  const bloque = st.type==="lectures" && !lecturesCochees(m,l,k);
  const suivante = k+1<c.lecons.length;
  return `<nav class="crumbs" aria-label="Fil d'Ariane"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><button type="button" data-go="module">${esc(m.titre)}</button><span>›</span><span>Leçon ${k+1} sur ${c.lecons.length}</span></nav>
  <section class="etape-tete" style="--lc:var(--n${i})">
    <p class="eyebrow" style="color:var(--n${i})">Leçon ${k+1} · ${esc(l.titre)}</p>
    <ol class="pas" aria-label="Étapes de la leçon">${E.map((x,j)=>`<li><button type="button" data-etape="${j}" class="${j===e?"cur":j<atteinte||lu?"vu":""}" ${j<atteinte||lu?"":"disabled"} aria-label="Étape ${j+1} : ${esc(x.titre)}" ${j===e?'aria-current="step"':""}></button></li>`).join("")}</ol>
    <p class="hint">Étape ${e+1} sur ${E.length} · environ ${st.min} min${E.length>1?` · il reste environ ${E.slice(e).reduce((a,x)=>a+x.min,0)} min pour toute la leçon`:""}</p>
  </section>
  <article class="panel etape">
    <figure class="etape-img">${img(st.image)}</figure>
    <h2>${esc(st.titre)}</h2>
    <div class="etape-corps">${st.html}</div>
    ${st.type==="fin" ? (lu
      ? `<div class="keep" style="background:var(--ok-soft);border-color:var(--ok)">Leçon terminée. Bravo !</div>`
      : `<div class="row"><button class="btn primary" type="button" id="terminer" ${lecturesCochees(m,l,k)?"":"disabled"}>J'ai terminé cette leçon</button>${lecturesCochees(m,l,k)?"":`<span class="hint">Retourne à l'étape 1 pour cocher tes lectures bibliques.</span>`}</div>`) : ""}
  </article>
  <div class="etape-nav">
    ${e>0?`<button class="btn" type="button" data-etape="${e-1}">← Précédent</button>`:`<button class="btn" type="button" data-go="module">← Le module</button>`}
    ${e<E.length-1?`<button class="btn primary" type="button" data-etape="${e+1}" ${bloque?"disabled":""}>Suivant →</button>`
      : lu ? (suivante?`<button class="btn primary" type="button" data-lecon="${k+1}">Leçon suivante →</button>`:`<button class="btn primary" type="button" data-go="module">Retour au module →</button>`) : ""}
  </div>
  ${st.type==="lectures"?`<p class="hint" id="hint-lect" style="text-align:right" ${bloque?"":"hidden"}>Coche chaque lecture pour continuer.</p>`:""}
  <p class="hint" style="text-align:center"><button class="lien" type="button" id="mode-plein">Afficher toute la leçon sur une seule page</button></p>`;
}
function allerEtape(j){
  const m=findModule(S.moduleId), c=S.mods[S.moduleId], k=S.lecon.k, E=etapesLecon(m,c.lecons[k],k);
  j=Math.min(Math.max(0,j),E.length-1); S.lecon.etape=j;
  try{ localStorage.setItem(cleEtape(m.id,k), String(j)); }catch(e){}
  const cle=m.id+"-"+k, srv=S.etu.etapes[cle];
  if(!srv || srv.atteinte<j+1 || srv.total!==E.length){
    S.etu.etapes[cle]={atteinte:Math.max(srv?srv.atteinte:0,j+1), total:E.length};
    S.sb.rpc("marquer_etape",{p_module:m.id, p_lecon:k, p_etape:Math.min(Math.max(srv?srv.atteinte:0,j+1),E.length), p_total:E.length}).then(({error})=>{ if(error) console.warn(error.message); });
  }
  render(); window.scrollTo({top:0});
}

// ----- jeux -----
const JEUX=[];
function jeu(type, data){ JEUX.push({type, data}); return `<div class="jeu" data-jeu="${JEUX.length-1}"></div>`; }
const nettoyer = w => w.replace(/^[«"“(‘'\-]+|[.,;:!?»"”)’'\-]+$/g,"");
function initJeu(el){
  const J=JEUX[+el.dataset.jeu]; if(!J) return;
  ({verset:jeuVerset, associer:jeuAssocier, vraiFaux:jeuVraiFaux, tri:jeuTri}[J.type])(el, J.data);
}
function jeuVerset(el, memo){
  const mots=memo.texte.split(/\s+/);
  const cand=mots.map((w,i)=>({i,c:nettoyer(w)})).filter(x=>x.c.length>=5);
  const pas=Math.max(1,Math.ceil(cand.length/5)), trous=cand.filter((_,j)=>j%pas===Math.floor(pas/2)).slice(0,5);
  if(trous.length<2){ el.remove(); return; }
  const set=new Set(trous.map(t=>t.i)); let pos=0;
  el.innerHTML=`<p class="eyebrow">Jeu · complète le verset</p>
    <p class="verset-jeu">${mots.map((w,i)=>set.has(i)?w.replace(nettoyer(w),`<span class="trou" data-t="${i}">${"_".repeat(Math.min(10,nettoyer(w).length))}</span>`):esc(w)).join(" ")}</p>
    <div class="banque">${shuffle(trous).map(t=>`<button type="button" class="mot" data-m="${t.i}">${esc(t.c)}</button>`).join("")}</div>
    <p class="hint res" aria-live="polite">Touche les mots dans l'ordre du verset.</p>`;
  const res=el.querySelector(".res");
  el.querySelectorAll(".mot").forEach(b=>b.onclick=()=>{
    const attendu=trous.slice().sort((a,b)=>a.i-b.i)[pos];
    if(nettoyer(b.textContent)===attendu.c){ const t=el.querySelector(`[data-t="${attendu.i}"]`); t.textContent=attendu.c; t.classList.add("ok"); b.remove(); pos++;
      if(pos===trous.length){ res.innerHTML=`<b>Bravo !</b> Tu as complété ${esc(memo.ref)}. Récite-le maintenant sans regarder. <button type="button" class="lien" data-rejouer>Rejouer</button>`; res.querySelector("[data-rejouer]").onclick=()=>jeuVerset(el,memo); }
      else res.textContent="Bien ! Continue."; }
    else { b.classList.add("faux"); setTimeout(()=>b.classList.remove("faux"),600); res.textContent="Pas tout à fait : essaie un autre mot."; }
  });
}
function jeuAssocier(el, mots){
  const items=mots.slice(0,5).map((w,i)=>({i, g:w.mot, d:(String(w.sens).split(/(?<=[.!?])\s/)[0]).slice(0,160)}));
  let sel=null, ok=0;
  el.innerHTML=`<p class="eyebrow">Jeu · associe chaque mot à son sens</p>
    <div class="assoc"><div>${items.map(x=>`<button type="button" class="carte g" data-i="${x.i}">${esc(x.g)}</button>`).join("")}</div>
    <div>${shuffle(items).map(x=>`<button type="button" class="carte d" data-i="${x.i}">${esc(x.d)}</button>`).join("")}</div></div>
    <p class="hint res" aria-live="polite">Touche un mot à gauche, puis son sens à droite.</p>`;
  const res=el.querySelector(".res");
  el.querySelectorAll(".carte.g").forEach(b=>b.onclick=()=>{ if(b.disabled) return; el.querySelectorAll(".carte.g").forEach(x=>x.classList.remove("sel")); b.classList.add("sel"); sel=b; });
  el.querySelectorAll(".carte.d").forEach(b=>b.onclick=()=>{
    if(!sel){ res.textContent="Choisis d'abord un mot à gauche."; return; }
    if(b.dataset.i===sel.dataset.i){ [b,sel].forEach(x=>{ x.classList.remove("sel"); x.classList.add("ok"); x.disabled=true; }); sel=null; ok++;
      res.innerHTML = ok===items.length ? `<b>Bravo !</b> Tous les mots sont associés. <button type="button" class="lien" data-rejouer>Rejouer</button>` : "Juste !";
      const r=res.querySelector("[data-rejouer]"); if(r) r.onclick=()=>jeuAssocier(el,mots); }
    else { b.classList.add("faux"); setTimeout(()=>b.classList.remove("faux"),600); res.textContent="Ce n'est pas ce sens-là. Réessaie."; }
  });
}
function jeuVraiFaux(el, liste){
  let rep=0, bons=0;
  el.innerHTML=`<ol class="vf">${liste.map((x,i)=>`<li data-i="${i}"><p>${esc(x.affirmation)}</p><div class="row"><button type="button" class="btn small" data-v="1">Vrai</button><button type="button" class="btn small" data-v="0">Faux</button></div><p class="hint expl" hidden></p></li>`).join("")}</ol>
    <p class="score-jeu" aria-live="polite"></p>`;
  el.querySelectorAll(".vf li").forEach(li=>li.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{
    const x=liste[+li.dataset.i], juste=(b.dataset.v==="1")===x.vrai;
    li.querySelectorAll("[data-v]").forEach(y=>y.disabled=true); b.classList.add(juste?"ok":"faux"); li.classList.add(juste?"juste":"rate");
    const p=li.querySelector(".expl"); p.hidden=false; p.innerHTML=`<b>${juste?"Juste !":"Pas tout à fait."}</b> C'est ${x.vrai?"vrai":"faux"}. ${esc(x.explication)}`;
    rep++; if(juste) bons++;
    if(rep===liste.length){ const s=el.querySelector(".score-jeu"); s.innerHTML=`Score : <b>${bons} / ${liste.length}</b>. ${bons===liste.length?"Parfait !":"Relis les explications, puis rejoue."} <button type="button" class="lien" data-rejouer>Rejouer</button>`; s.querySelector("[data-rejouer]").onclick=()=>jeuVraiFaux(el,liste); }
  }));
}
function jeuTri(el, tri){
  const els=shuffle(tri.elements); let i=0, bons=0;
  const tour=()=>{
    if(i>=els.length){ el.innerHTML=`<div class="tri-carte"><p>Score : <b>${bons} / ${els.length}</b>. ${bons===els.length?"Excellent discernement !":"Relis les explications : le discernement grandit avec la pratique."}</p><button type="button" class="btn small" data-rejouer>Rejouer</button></div>`; el.querySelector("[data-rejouer]").onclick=()=>jeuTri(el,tri); return; }
    const x=els[i];
    el.innerHTML=`<div class="tri-carte"><p class="hint">Situation ${i+1} sur ${els.length}</p><p class="tri-texte">${esc(x.texte)}</p>
      <div class="tri-cats">${tri.categories.map((c,ci)=>`<button type="button" class="btn" data-c="${ci}">${esc(c)}</button>`).join("")}</div><p class="hint expl" aria-live="polite"></p></div>`;
    el.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
      const juste=+b.dataset.c===x.categorie; if(juste) bons++;
      el.querySelectorAll("[data-c]").forEach(y=>{ y.disabled=true; if(+y.dataset.c===x.categorie) y.classList.add("ok"); });
      if(!juste) b.classList.add("faux");
      const p=el.querySelector(".expl"); p.innerHTML=`<b>${juste?"Juste !":"Réponse : « "+esc(tri.categories[x.categorie])+" »."}</b> ${esc(x.explication)} <br><button type="button" class="btn small primary" data-suite>${i+1<els.length?"Situation suivante":"Voir mon score"}</button>`;
      p.querySelector("[data-suite]").onclick=()=>{ i++; tour(); };
    });
  };
  tour();
}

function vModule(){
  const m = findModule(S.moduleId); const c = S.mods[S.moduleId]; if(!m||!c) return vParcours();
  const n=m.niveau, i=niveauIndex(n), s=statut(m), ev=(S.etu.evaluations||{})[m.id];
  return `<nav class="crumbs" aria-label="Fil d'Ariane"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><span>Niveau ${i} · ${esc(n.nom)}</span></nav>
  <section class="hero"><p class="eyebrow" style="color:var(--n${i})">Module ${n.modules.findIndex(x=>x.id===m.id)+1} sur ${n.modules.length}</p><h1>${esc(m.titre)}</h1><p class="lead"><b>Objectif :</b> ${esc(m.objectif)}</p></section>
  <section class="steps" aria-label="Avancement">
    <div class="step ${s.leconsFinies?"on":""}"><b>Leçons</b>${s.lus} / ${s.nb} terminées</div>
    <div class="step ${s.pratique?"on":""}"><b>Foi agissante</b>${s.pratique?"Témoignage déposé":"À faire"}</div>
    <div class="step ${s.reussi?"on":""}"><b>Examen</b>${s.r.meilleur!=null?note20(s.r.meilleur):"Non passé"}</div>
    <div class="step ${s.certifie?"on":""}"><b>Attestation</b>${s.certifie?(s.parTest?"Par test de passage":"Obtenue"):"Pas encore"}</div>
  </section>
  ${(c.introduction||[]).length?`<section class="panel prose">${paras(c.introduction)}</section>`:""}
  ${(c.lecturesObligatoires||[]).length?`<section class="panel"><p class="eyebrow">Plan de lecture du module</p><h2>Lectures bibliques obligatoires</h2><ul class="readlist">${c.lecturesObligatoires.map(x=>`<li><b>${esc(x.ref)}</b>${x.consigne?` : ${esc(x.consigne)}`:""}</li>`).join("")}</ul></section>`:""}
  <section class="panel" style="display:grid;gap:12px"><div><p class="eyebrow">Les leçons</p><h2>Avancez pas à pas</h2></div>
    <p class="hint">Chaque leçon est découpée en petites étapes de quelques minutes : lecture de la Bible, récit, explication, jeux… Vous pouvez vous arrêter à tout moment : la plateforme se souvient de l'étape où vous êtes.</p>
    <div class="lcards">${c.lecons.map((l,k)=>{ const lu=(S.etu.lecons||{})[m.id+"-"+k], et=(S.etu.etapes||{})[m.id+"-"+k];
      return `<article class="lcard"><figure>${img(illustrationLecon(l,k),"thumb")}</figure><div class="lc-corps"><p class="eyebrow">Leçon ${k+1}${lu?' · <span style="color:var(--ok)">terminée ✓</span>':""}</p><h3>${esc(l.titre)}</h3>
        ${et&&!lu?`<div class="bar" style="--lc:var(--n${i})"><i style="width:${pct(et.atteinte,et.total)}%"></i></div><p class="hint">Étape ${et.atteinte} sur ${et.total}</p>`:""}
        <div class="row"><button class="btn ${lu?"small":"primary"}" type="button" data-lecon="${k}">${lu?"Revoir":et?"Continuer":"Commencer"}</button></div></div></article>`; }).join("")}</div>
  </section>
  <section class="panel" style="display:grid;gap:12px">
    <div><p class="eyebrow">Foi agissante</p><h2>Mise en pratique</h2></div>
    <p>${esc(c.pratique.consigne)}</p>
    ${(c.pratique.etapes||[]).length?`<ol>${c.pratique.etapes.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`:""}
    <label class="f" for="pratique">Votre témoignage <span class="hint">(au moins ${MIN_PRATIQUE} caractères ; votre enseignant pourra le lire et le noter)</span>
      <textarea id="pratique" maxlength="4000">${esc(s.r.pratique||"")}</textarea></label>
    <div class="row"><button class="btn" id="save-pratique" type="button">Enregistrer mon témoignage</button><span class="hint" id="pr-count"></span></div>
    ${s.r.pratique ? ({valide:`<p class="pill ok" style="justify-self:start">Témoignage validé par votre enseignant</p>`,
       a_revoir:`<div class="keep" style="background:var(--bad-soft);border-color:var(--bad)">Votre enseignant vous demande de revoir votre témoignage${s.r.pratiqueAvis?` : <span style="font-weight:400">${esc(s.r.pratiqueAvis)}</span>`:"."}</div>`,
       en_attente:`<p class="hint">Témoignage enregistré : votre enseignant va le lire.</p>`}[s.r.pratiqueStatut]||"") : ""}
    ${ev ? `<div class="keep" style="background:var(--surface2);border-color:var(--navy)">Appréciation de l'enseignant${ev.note!=null?` : <b>${esc(ev.note)}/20</b>`:""}${ev.commentaire?`<br><span style="font-weight:400">${esc(ev.commentaire)}</span>`:""}</div>`:""}
  </section>
  <section class="panel" style="display:grid;gap:12px">
    <div><p class="eyebrow">Évaluation</p><h2>Examen du module</h2></div>
    <p class="hint">${c.examen.length} questions corrigées en ligne, notées sur 20. Il faut au moins 16/20 pour ouvrir le module suivant. Durée : ${DUREE_EXAMEN} minutes, chrono affiché ; si vous quittez l'écran, l'examen recommence depuis le début. Vous pouvez repasser l'examen autant de fois que nécessaire ; la meilleure note est conservée.${s.tentatives?` Tentatives : ${s.tentatives}.`:""}</p>
    <div class="row"><button class="btn primary" type="button" data-go="examen" ${s.leconsFinies?"":"disabled"}>${s.tentatives?"Repasser l'examen":"Commencer l'examen"}</button>${s.leconsFinies?"":`<span class="hint">${s.tentatives&&!s.reussi?"Examen non réussi : reprenez le cours. ":""}Disponible quand les ${s.nb} leçons sont terminées.</span>`}</div>
  </section>
  ${certSection(m,s)}`;
}

function certSection(m,s){
  if(s.certifie) return `<section class="cert"><p class="eyebrow">Attestation n° ${esc(s.r.certNo)}</p><div class="nm">${esc((S.etu.identite&&S.etu.identite.nomNaissance)||S.etu.nom)}</div><p>${s.parTest?`a validé le module « ${esc(m.titre)} » par le test de passage du niveau, avec ${note20(s.r.meilleur)}.`:`a réussi le module « ${esc(m.titre)} » avec ${note20(s.r.meilleur)} et a mis sa foi en pratique.`}</p><p class="hint">Délivrée le ${fmtDate(s.r.certDate)}</p><div class="row" style="justify-content:center"><button class="btn gold" type="button" data-pdf="${m.id}">Télécharger l'attestation (PDF)</button></div></section>`;
  const manque = [];
  if(!identiteOk()) manque.push("compléter votre fiche d'identité (nom de l'acte de naissance, date de naissance et photo sur fond blanc) sur la page « Mon parcours »");
  if(!s.reussi) manque.push("obtenir au moins 16/20 à l'examen");
  if(!s.pratique) manque.push("déposer votre témoignage de foi agissante");
  else if(s.r.pratiqueStatut==="a_revoir") manque.push("revoir votre témoignage comme votre enseignant le demande");
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

// ----- chrono et anti-triche -----
const DUREE_EXAMEN = 15, DUREE_TEST = 25; // minutes (contrôlées aussi par le serveur)
function melangerExamen(c){ return shuffle(c.examen.map((q,qi)=>({cle:String(qi), q:q.q, choix: shuffle(q.choix)}))); }
function melangerTest(brut){ return shuffle(brut).map(x=>{ const q=S.mods[x.m].examen[x.q]; return {cle:x.m+":"+x.q, q:q.q, choix:shuffle(q.choix)}; }); }
function reglesEpreuve(min){
  return `<ul><li>Vous avez <b>${min} minutes</b>. Le chrono s'affiche à l'écran pendant toute l'épreuve.</li>
    <li>À la fin du temps, l'épreuve est bloquée et votre copie est <b>envoyée automatiquement</b> à la correction, avec les réponses déjà données (une question sans réponse compte comme fausse).</li>
    <li>Pour éviter la triche : si vous <b>quittez l'écran</b> (appel reçu, autre application, autre onglet), l'épreuve <b>recommence depuis le début</b>, avec les questions dans un autre ordre et un nouveau chrono.</li>
    <li>Conseil : mettez votre téléphone en mode avion ou « Ne pas déranger » avant de commencer.</li></ul>`;
}
function resteMs(fin){ return Math.max(0, fin-Date.now()); }
function fmtChrono(ms){ const t=Math.ceil(ms/1000), m=Math.floor(t/60), s=t%60; return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }
function chronoHtml(fin){ const r=resteMs(fin); return `<span id="chrono" class="chrono ${r<120000?"urgent":""}" role="timer">⏱ ${fmtChrono(r)}</span>`; }
// Épreuve en cours (questions affichées, pas encore envoyée) : "examen", "test" ou null
function epreuveEnCours(){
  if(S.view==="examen" && S.exam && S.exam.demarre && !S.exam.fini && !S.exam.envoi) return "examen";
  if(S.view==="test" && S.test && S.test.id && !S.test.res && !S.test.envoi) return "test";
  return null;
}
// Plein écran pendant l'épreuve (Android, ordinateur ; ignoré là où ce n'est pas possible, comme sur iPhone)
function pleinEcran(){ try{ const d=document.documentElement, f=d.requestFullscreen||d.webkitRequestFullscreen; if(f && !document.fullscreenElement){ const r=f.call(d,{navigationUI:"hide"}); if(r&&r.catch) r.catch(()=>{}); } }catch(e){} }
function sortirPleinEcran(){ try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(e){} }
async function demarrerExamen(){
  const E=S.exam; if(!E) return;
  pleinEcran();
  E.chargement=true; render();
  try{ const d=await rpc("demarrer_examen",{p_module:S.moduleId}); E.demarre=true; E.fin=Date.now()+(d&&d.duree||DUREE_EXAMEN*60)*1000; }catch(e){}
  E.chargement=false; render(); window.scrollTo({top:0});
}
const MSG_SORTIE = "Vous avez quitté l'écran pendant l'épreuve (appel, autre application ou autre onglet). Pour éviter la triche, elle recommence depuis le début, avec un nouveau chrono.";
async function recommencerEpreuve(){
  const type=epreuveEnCours(); if(!type) return;
  if(type==="examen"){
    const E=S.exam, c=S.mods[S.moduleId];
    E.questions=melangerExamen(c); E.rep={}; E.alerte=MSG_SORTIE; E.fin=Date.now()+DUREE_EXAMEN*60000;
    render(); window.scrollTo({top:0});
    try{ const d=await rpc("demarrer_examen",{p_module:S.moduleId}); if(S.exam===E) E.fin=Date.now()+(d&&d.duree||DUREE_EXAMEN*60)*1000; }catch(e){ if(S.exam===E){ E.demarre=false; render(); } }
  }else{
    const T=S.test;
    T.questions=melangerTest(T.brut); T.rep={}; T.page=0; T.alerte=MSG_SORTIE; T.fin=Date.now()+DUREE_TEST*60000;
    render(); window.scrollTo({top:0});
    try{ const d=await rpc("recommencer_test",{p_test:T.id}); if(S.test===T) T.fin=Date.now()+(d&&d.duree||DUREE_TEST*60)*1000; }catch(e){}
  }
}
// Détection de sortie d'écran : onglet caché (appel, autre appli) ou fenêtre qui perd le focus
let sortie=false;
function surSortie(){ if(epreuveEnCours()) sortie=true; }
function surRetour(){ if(sortie && document.visibilityState==="visible"){ sortie=false; recommencerEpreuve(); } }
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") surSortie(); else surRetour(); });
window.addEventListener("blur", ()=>setTimeout(()=>{ if(!document.hasFocus()) surSortie(); }, 300));
window.addEventListener("focus", surRetour);
window.addEventListener("pagehide", surSortie);
// Chrono : mise à jour chaque seconde, envoi automatique à la fin du temps
setInterval(()=>{
  const type=epreuveEnCours(); if(!type || sortie) return;
  const X = type==="examen" ? S.exam : S.test, r=resteMs(X.fin), el=document.getElementById("chrono");
  if(el){ el.textContent="⏱ "+fmtChrono(r); el.classList.toggle("urgent", r<120000); }
  if(r<=0){ toast("Temps écoulé : votre copie a été envoyée à la correction."); type==="examen" ? envoyerExamen(true) : envoyerTest(true); }
}, 1000);
async function envoyerExamen(auto){
  const E=S.exam; if(!E || E.envoi || E.fini) return;
  if(!auto && Object.keys(E.rep).length<E.questions.length){ document.getElementById("ex-hint").textContent=`Répondez à toutes les questions avant de valider (${E.questions.length-Object.keys(E.rep).length} restantes).`; return; }
  const reponses={}; E.questions.forEach((q,i)=>{ if(E.rep[i]!=null) reponses[q.cle]=q.choix[E.rep[i]]; });
  E.envoi=true; E.alerte=null; render();
  sortirPleinEcran();
  try{ E.res=await rpc("soumettre_examen",{p_module:S.moduleId, p_reponses:reponses}); E.fini=true; await chargerEtu(); }
  catch(err){ E.envoi=false; if(resteMs(E.fin)<=0){ E.demarre=false; E.questions=melangerExamen(S.mods[S.moduleId]); E.rep={}; } }
  render(); window.scrollTo({top:0});
}
async function envoyerTest(auto){
  const T=S.test; if(!T || T.envoi || T.res) return;
  const manque=T.questions.length-Object.keys(T.rep).length;
  if(!auto && manque){ const p=T.questions.findIndex((_,i)=>T.rep[i]==null); document.getElementById("t-hint").textContent=`Il reste ${manque} question(s) sans réponse (la première est à la page ${Math.floor(p/PAR_PAGE)+1}).`; return; }
  const reponses={}; T.questions.forEach((q,i)=>{ if(T.rep[i]!=null) reponses[q.cle]=q.choix[T.rep[i]]; });
  T.envoi=true; T.alerte=null; render(); sortirPleinEcran();
  try{ T.res=await rpc("soumettre_test",{p_test:T.id, p_reponses:reponses}); await chargerEtu(); }catch(err){ T.envoi=false; if(resteMs(T.fin)<=0) S.test=null; }
  render(); window.scrollTo({top:0});
}

function vExamen(){
  const m = findModule(S.moduleId), c = S.mods[S.moduleId];
  if(!S.exam) S.exam = { questions: melangerExamen(c), rep:{}, fini:false, res:null, envoi:false, demarre:false, fin:0 };
  const E=S.exam, nbRep=Object.keys(E.rep).length;
  if(!E.demarre && !E.fini) return `<nav class="crumbs"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><button type="button" data-go="module">${esc(m.titre)}</button><span>›</span><span>Examen</span></nav>
  <section class="hero"><p class="eyebrow">Examen en ligne · ${E.questions.length} questions · noté sur 20</p><h1>${esc(m.titre)}</h1></section>
  <section class="panel" style="display:grid;gap:12px">${reglesEpreuve(DUREE_EXAMEN)}
    <div class="row"><button class="btn primary" type="button" id="start-exam" ${E.chargement?"disabled":""}>${E.chargement?"Préparation…":`Commencer l'examen (${DUREE_EXAMEN} minutes)`}</button><button class="btn" type="button" data-go="module">Annuler</button></div></section>`;
  let res="";
  if(E.fini && E.res){
    const pass=E.res.score/E.res.total>=SEUIL;
    res = `<section class="panel score" style="border-color:${pass?"var(--ok)":"var(--bad)"}"><div class="big" style="color:${pass?"var(--ok)":"var(--bad)"}">${note20(E.res.score/E.res.total)}</div><div style="flex:1;min-width:200px"><h3>${pass?"Examen réussi !":"Pas encore : il faut au moins 16/20."}</h3><p class="hint">${E.res.score} bonnes réponses sur ${E.res.total}. ${pass?"Le module suivant est ouvert. Retournez au module pour recevoir votre attestation.":E.res.retour_cours?"Les questions manquées sont marquées en rouge.":"Les questions manquées sont marquées en rouge. Relisez les leçons puis réessayez."}</p></div>
    ${!pass && E.res.retour_cours ? `<p class="keep alerte" style="flex-basis:100%">Vous n'avez pas atteint 16/20 : vous devez reprendre le cours de ce module. Les leçons sont à refaire avant de pouvoir repasser l'examen. Votre enseignant peut, s'il le juge bon, vous autoriser à repasser l'examen directement.</p>` : ""}
    <div class="row">${!pass && E.res.retour_cours ? `<button class="btn primary" type="button" id="reprendre-cours">Reprendre le cours</button>` : `<button class="btn primary" type="button" data-go="module">Retour au module</button>${pass?"":`<button class="btn" type="button" id="retry">Réessayer</button>`}`}</div></section>`;
  }
  const info = E.res ? {justes:new Set((E.res.justes||[]).map(String)), bonnes:E.res.bonnes, expl:E.res.explications} : null;
  return `<nav class="crumbs"><button type="button" data-go="parcours">Mon parcours</button><span>›</span><button type="button" data-go="module">${esc(m.titre)}</button><span>›</span><span>Examen</span></nav>
  <section class="hero"><p class="eyebrow">Examen en ligne · ${E.questions.length} questions · noté sur 20</p><h1>${esc(m.titre)}</h1></section>
  ${res}
  ${E.alerte&&!E.fini?`<div class="keep alerte">${esc(E.alerte)}</div>`:""}
  ${E.fini?"":`<div class="counter">${chronoHtml(E.fin)} · <span id="compte" aria-live="polite">${nbRep} / ${E.questions.length} répondues</span></div>`}
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
      <li>Vous avez <b>${DUREE_TEST} minutes</b> : le chrono s'affiche à l'écran. À la fin du temps, votre copie est envoyée automatiquement à la correction, avec les réponses déjà données.</li>
      <li>Si vous quittez l'écran (appel, autre application, autre onglet), le test <b>recommence depuis le début</b> avec un nouveau chrono. Au plus <b>3 essais par 24 heures</b>.</li>
      <li>Les corrections détaillées ne sont pas affichées, pour garder le test fiable.</li></ul>
    <div class="row"><button class="btn primary" type="button" id="start-test">Commencer le test</button><button class="btn" type="button" data-go="parcours">Annuler</button></div></section>`;
  if(T.chargement) return head + `<div class="empty">Préparation des questions…</div>`;
  if(T.res){ const ok=T.res.reussi; return head + `<section class="panel score" style="border-color:${ok?"var(--ok)":"var(--bad)"}"><div class="big" style="color:${ok?"var(--ok)":"var(--bad)"}">${String(T.res.note20).replace(".",",")}/20</div>
    <div style="flex:1;min-width:200px"><h3>${ok?"Test réussi ! Toutes les attestations du niveau vous sont délivrées.":"Pas encore : il faut au moins 16/20."}</h3><p class="hint">${T.res.bonnes} bonnes réponses sur ${T.res.total}. ${ok?(S.niveauTest<4?"Le niveau suivant est ouvert.":"Vous avez terminé le programme."):"Vous devez maintenant suivre les cours de ce niveau, module après module. Votre enseignant peut, s'il le juge bon, vous autoriser un nouveau test."}</p></div>
    <div class="row">${ok?`<button class="btn primary" type="button" data-go="parcours">Retour à mon parcours</button>`:`<button class="btn primary" type="button" data-open="${premierModuleAFaire(S.niveauTest).id}">Commencer les cours du niveau</button><button class="btn" type="button" data-go="parcours">Mon parcours</button>`}</div></section>`; }
  const tot=T.questions.length, pages=Math.ceil(tot/PAR_PAGE), p=T.page, debut=p*PAR_PAGE, nbRep=Object.keys(T.rep).length;
  const qs=T.questions.slice(debut, debut+PAR_PAGE);
  return head + `${T.alerte?`<div class="keep alerte">${esc(T.alerte)}</div>`:""}<div class="counter">${chronoHtml(T.fin)} · <span id="compte" aria-live="polite">${nbRep} / ${tot} répondues · page ${p+1} sur ${pages}</span></div>
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
  pleinEcran();
  const niv=S.niveauTest, n=S.prog.niveaux[niv-1];
  S.test={chargement:true}; render();
  try{
    const d = await rpc("demarrer_test",{p_niveau:niv});
    await Promise.all(n.modules.map(m=>getModule(m.id)));
    S.test = { id:d.id, page:0, rep:{}, res:null, envoi:false, brut:d.questions, fin:Date.now()+(d.duree||DUREE_TEST*60)*1000,
      questions: melangerTest(d.questions) };
  }catch(e){ S.test=null; }
  render(); window.scrollTo({top:0});
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
  HDF.lierIdentifiant($app, render);
  $app.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ const i=document.getElementById(b.dataset.pw), voir=i.type==="password";
    i.type = voir ? "text" : "password"; b.textContent = voir ? "Masquer" : "Afficher"; b.setAttribute("aria-pressed", String(voir)); i.focus(); });
  $app.querySelectorAll("[data-lect]").forEach(cb=>cb.onchange=()=>{ const [k,j]=cb.id.slice(3).split("-"); S.lus[S.moduleId+k+"-"+j]=cb.checked;
    const det=cb.closest("details"); const tous=[...det.querySelectorAll("[data-lect]")].every(x=>x.checked);
    const btn=det.querySelector("[data-lu]"); if(btn) btn.disabled=!tous; });
  $app.querySelectorAll("[data-lecon]").forEach(b=>b.onclick=()=>{ S.lecon=null; go("lecon", null, +b.dataset.lecon); });
  $app.querySelectorAll("[data-etape]").forEach(b=>b.onclick=()=>allerEtape(+b.dataset.etape));
  $app.querySelectorAll("[data-jeu]").forEach(initJeu);
  $app.querySelectorAll("[data-lect2]").forEach(cb=>cb.onchange=()=>{ S.lus[S.moduleId+S.lecon.k+"-"+cb.dataset.lect2]=cb.checked;
    const tous=[...$app.querySelectorAll("[data-lect2]")].every(x=>x.checked), nx=$app.querySelector(".etape-nav button.primary[data-etape]"), h=document.getElementById("hint-lect");
    if(nx) nx.disabled=!tous; if(h) h.hidden=tous; });
  const mp=document.getElementById("mode-plein"); if(mp) mp.onclick=()=>{ S.pleinePage=true; render(); window.scrollTo({top:0}); };
  const me=document.getElementById("mode-etapes"); if(me) me.onclick=()=>{ S.pleinePage=false; render(); window.scrollTo({top:0}); };
  const tl=document.getElementById("terminer"); if(tl) tl.onclick=async()=>{ tl.disabled=true;
    try{ await rpc("marquer_lecon",{p_module:S.moduleId, p_lecon:S.lecon.k}); await chargerEtu(); toast("Leçon terminée. Bravo !"); }catch(e){ tl.disabled=false; }
    render(); };
  $app.querySelectorAll("[data-lu]").forEach(b=>b.onclick=()=>{ b.disabled=true; apres(rpc("marquer_lecon",{p_module:S.moduleId, p_lecon:+b.dataset.lu}),"Leçon terminée."); });
  $app.querySelectorAll("[data-pdf]").forEach(b=>b.onclick=()=>pdfModule(findModule(b.dataset.pdf)));
  $app.querySelectorAll("[data-diplome]").forEach(b=>b.onclick=()=>pdfNiveau(S.prog.niveaux.find(n=>n.id===b.dataset.diplome)));
  const st=document.getElementById("start-test"); if(st) st.onclick=demarrerTest;

  const af=document.getElementById("auth-form"); if(af) af.onsubmit=auth;
  const mf=document.getElementById("mdp-form"); if(mf) mf.onsubmit=async e=>{ e.preventDefault();
    const {error}=await S.sb.auth.updateUser({password:document.getElementById("n-mdp").value});
    if(error){ document.getElementById("n-msg").textContent=erreur(error); return; }
    S.recovery=false; toast("Mot de passe modifié."); go("parcours"); };
  const vf=document.getElementById("verif-form"); if(vf){ vf.onsubmit=async e=>{ e.preventDefault();
    const out=document.getElementById("v-res");
    const nos=document.getElementById("v-no").value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean).slice(0,12);
    let html="";
    for(const no of nos){
      const {data,error}=await S.sb.rpc("verifier_attestation",{p_no:no});
      if(error){ out.innerHTML=`<p class="hint">${esc(erreur(error))}</p>`; return; }
      if(!data){ html+=`<div class="keep" style="background:var(--bad-soft);border-color:var(--bad)">${nos.length>1?esc(no)+" : ":""}Aucune attestation ne correspond à ce numéro.</div>`; continue; }
      const m=findModule(data.module);
      html+=`<div class="keep" style="background:var(--ok-soft);border-color:var(--ok)">Attestation authentique${nos.length>1?" ("+esc(no)+")":""} : <b>${esc(data.nom)}</b> a validé le module « ${esc(m?m.titre:data.module)} » ${data.origine==="test"?"par le test de passage du niveau ":""}avec ${note20(data.score)}, le ${fmtDate(data.date)}.</div>`;
    }
    out.innerHTML=html; };
    if(S.verifNo){ document.getElementById("v-no").value=S.verifNo; S.verifNo=null; vf.requestSubmit ? vf.requestSubmit() : vf.onsubmit(new Event("submit")); } }

  lierFiche();
  const ta=document.getElementById("pratique");
  if(ta){ const c=document.getElementById("pr-count"); const upd=()=>{ const n=ta.value.trim().length; c.textContent = n<MIN_PRATIQUE ? `${n} / ${MIN_PRATIQUE} caractères minimum` : `${n} caractères`; }; ta.oninput=upd; upd();
    document.getElementById("save-pratique").onclick=()=>apres(rpc("enregistrer_pratique",{p_module:S.moduleId, p_texte:ta.value}),"Témoignage enregistré."); }
  const dv=document.getElementById("delivrer");
  if(dv) dv.onclick=()=>{ dv.disabled=true; apres(rpc("delivrer_attestation",{p_module:S.moduleId}),"Attestation délivrée. Vous pouvez la télécharger."); };

  const f=document.getElementById("exam-form");
  if(f && S.exam && !S.exam.fini){
    f.onchange=e=>{ const t=e.target; if(t.name&&t.name.startsWith("q")){ S.exam.rep[+t.name.slice(1)]=+t.value; const c=document.getElementById("compte"); if(c) c.textContent=`${Object.keys(S.exam.rep).length} / ${S.exam.questions.length} répondues`; } };
    f.onsubmit=e=>{ e.preventDefault(); envoyerExamen(false); };
  }
  const se=document.getElementById("start-exam"); if(se) se.onclick=demarrerExamen;
  const rc=document.getElementById("reprendre-cours"); if(rc) rc.onclick=()=>{ recommencerCours(S.moduleId); go("lecon", S.moduleId, 0); };
  const rt=document.getElementById("retry"); if(rt) rt.onclick=()=>{ S.exam=null; render(); window.scrollTo({top:0}); };

  const tf=document.getElementById("test-form");
  if(tf && S.test){
    const T=S.test, maj=()=>{ const c=document.getElementById("compte"), n=Object.keys(T.rep).length; if(c) c.textContent=`${n} / ${T.questions.length} répondues · page ${T.page+1} sur ${Math.ceil(T.questions.length/PAR_PAGE)}`; const b=document.querySelector(".bar>i"); if(b) b.style.width=pct(n,T.questions.length)+"%"; };
    tf.onchange=e=>{ const t=e.target; if(t.name&&t.name.startsWith("t")){ T.rep[+t.name.slice(1)]=+t.value; maj(); } };
    tf.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{ T.page=+b.dataset.page; render(); window.scrollTo({top:0}); });
    tf.onsubmit=e=>{ e.preventDefault(); envoyerTest(false); };
  }
}

async function auth(e){
  e.preventDefault();
  const msg=document.getElementById("a-msg");
  const mdp=document.getElementById("a-mdp")?.value||"";
  if(S.authMode==="oubli" && HDF.modeIdentifiant()==="tel"){ msg.textContent=`Contactez le responsable au ${HDF.INSTITUTION.telephone}.`; return; }
  let id; try{ id=HDF.lireIdentifiant("a"); }catch(err){ msg.textContent=err.message; return; }
  const email=id.email;
  if(S.authMode!=="oubli" && mdp.length<6){ msg.textContent="Le mot de passe doit contenir au moins 6 caractères."; return; }
  msg.textContent="Un instant…";
  try{
    if(S.authMode==="connexion"){
      const {error}=await S.sb.auth.signInWithPassword({email, password:mdp}); if(error) throw error; msg.textContent="";
    }else if(S.authMode==="inscription"){
      const nom=document.getElementById("a-nom").value.trim(), eglise=document.getElementById("a-eglise").value.trim();
      if(nom.length<3){ msg.textContent="Indiquez votre nom complet."; return; }
      const {data,error}=await S.sb.auth.signUp({email, password:mdp, options:{data:{nom, eglise, telephone:id.telephone||"", pays:id.pays||""}, emailRedirectTo:location.origin}});
      if(error) throw error;
      if(!data.session) msg.textContent="Compte créé. Ouvrez l'e-mail que nous venons de vous envoyer et cliquez sur le lien pour l'activer.";
    }else{
      const {error}=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin}); if(error) throw error;
      msg.textContent="Si un compte existe pour cette adresse, un lien vient d'être envoyé.";
    }
  }catch(err){ msg.textContent=erreur(err); }
}

const identiteOk = () => HDF.identiteComplete(S.etu, S.photo);
function profilForm(){
  const I=S.etu.identite||{}, ph=S.photoNouvelle||S.photo, ok=identiteOk();
  const champ=(id,label,val,extra)=>`<label class="f" for="${id}">${label}<input type="text" id="${id}" value="${esc(val)}" maxlength="80" ${extra||""}></label>`;
  return `<section class="panel fiche" id="fiche" style="display:grid;gap:14px;${ok?"":"border-color:var(--brass);border-width:2px"}">
    <div><p class="eyebrow">Ma fiche d'identité · ${esc(HDF.INSTITUTION.nom)}</p><h2>Les informations de vos attestations</h2>
      <p class="hint">${ok?"Votre fiche est complète. Vérifiez-la bien : ces informations figurent sur vos attestations et votre diplôme.":"Obligatoire pour recevoir vos attestations : votre nom complet exactement comme sur votre acte de naissance, votre date de naissance et une photo d'identité sur fond blanc."}</p></div>
    <div class="fiche-grille">
      <div class="photo-zone">
        <div class="photo-cadre">${ph?`<img src="${ph}" alt="Votre photo d'identité" id="p-photo-img">`:`<span class="hint">Pas encore de photo</span>`}</div>
        <label class="btn small" for="p-photo" style="justify-content:center">${ph?"Changer la photo":"Ajouter ma photo"}<input type="file" id="p-photo" accept="image/*" hidden></label>
        <p class="hint" id="p-photo-msg">Photo récente, de face, visage dégagé, <b>sur fond blanc</b>.</p>
      </div>
      <div class="grid2" style="align-content:start">
        ${champ("p-nn","Nom complet tel que sur l'acte de naissance <span class=\"hint\">(nom et prénoms)</span>",I.nomNaissance||S.etu.nom,'autocomplete="name" required')}
        <label class="f" for="p-dn">Date de naissance<input type="date" id="p-dn" value="${esc(I.dateNaissance)}" max="${new Date().toISOString().slice(0,10)}"></label>
        ${champ("p-ln","Lieu de naissance",I.lieuNaissance)}
        <label class="f" for="p-sexe">Sexe<select id="p-sexe"><option value=""></option><option value="F" ${I.sexe==="F"?"selected":""}>Féminin</option><option value="M" ${I.sexe==="M"?"selected":""}>Masculin</option></select></label>
        ${champ("p-nat","Nationalité",I.nationalite)}
        ${champ("p-tel","Téléphone (WhatsApp)",I.telephone,'inputmode="tel" autocomplete="tel"')}
        ${champ("p-pays","Pays de résidence",I.pays,'autocomplete="country-name"')}
        ${champ("p-ville","Ville",I.ville)}
        ${champ("p-nom","Nom d'usage <span class=\"hint\">(affiché sur le site)</span>",S.etu.nom)}
        ${champ("p-eglise","Église ou assemblée <span class=\"hint\">(facultatif)</span>",S.etu.eglise)}
      </div>
    </div>
    <div class="row"><button class="btn primary" id="p-save" type="button">Enregistrer ma fiche</button><span class="hint">Connecté : ${esc(HDF.afficherIdentifiant(S.session.user.email))}</span></div>
  </section>`;
}
// Recadre la photo au format identité (3 x 4), 360 x 480 pixels, et vérifie que le fond est clair
function preparerPhoto(fichier){
  return new Promise((ok, ko)=>{
    if(!/^image\//.test(fichier.type)) return ko(new Error("Choisissez une image (photo JPEG ou PNG)."));
    const url=URL.createObjectURL(fichier), im=new Image();
    im.onload=()=>{ const W=360,H=480, c=document.createElement("canvas"); c.width=W; c.height=H; const x=c.getContext("2d");
      x.fillStyle="#fff"; x.fillRect(0,0,W,H);
      const r=Math.max(W/im.width, H/im.height), w=im.width*r, h=im.height*r; x.drawImage(im,(W-w)/2,(H-h)/2,w,h);
      URL.revokeObjectURL(url);
      const bord=[...x.getImageData(0,0,36,180).data, ...x.getImageData(W-36,0,36,180).data]; let s=0,n=0;
      for(let i=0;i<bord.length;i+=4){ s+=(bord[i]+bord[i+1]+bord[i+2])/3; n++; }
      let q=0.86, d=c.toDataURL("image/jpeg",q); while(d.length>380000 && q>0.4){ q-=0.1; d=c.toDataURL("image/jpeg",q); }
      ok({image:d, fondClair: s/n > 200}); };
    im.onerror=()=>{ URL.revokeObjectURL(url); ko(new Error("Cette image ne peut pas être lue. Essayez une photo JPEG.")); };
    im.src=url;
  });
}
function lierFiche(){
  const f=document.getElementById("p-photo");
  if(f) f.onchange=async()=>{ const msg=document.getElementById("p-photo-msg"); if(!f.files[0]) return;
    try{ const r=await preparerPhoto(f.files[0]); S.photoNouvelle=r.image; garderSaisie(); render();
      const m=document.getElementById("p-photo-msg"); if(m) m.innerHTML = r.fondClair ? "Photo prête. Cliquez sur « Enregistrer ma fiche »." : "<b style=\"color:var(--bad)\">Le fond ne semble pas blanc.</b> Une photo sur fond blanc est demandée : reprenez-la devant un mur blanc si possible, puis enregistrez.";
      document.getElementById("fiche").scrollIntoView({block:"start"}); }
    catch(e){ msg.textContent=e.message; } };
  const ps=document.getElementById("p-save");
  if(ps) ps.onclick=async()=>{
    const v=id=>document.getElementById(id).value.trim();
    const nn=v("p-nn"), dn=v("p-dn");
    if(nn.length<3){ toast("Indiquez votre nom complet tel qu'il figure sur votre acte de naissance."); return; }
    if(dn && (dn<"1900-01-01" || dn>new Date().toISOString().slice(0,10))){ toast("La date de naissance n'est pas valide."); return; }
    ps.disabled=true;
    const maj={nom:v("p-nom")||nn, eglise:v("p-eglise"), nom_naissance:nn, date_naissance:dn||null, lieu_naissance:v("p-ln"), sexe:v("p-sexe"),
      nationalite:v("p-nat"), telephone:v("p-tel"), pays:v("p-pays"), ville:v("p-ville")};
    const {error}=await S.sb.from("profils").update(maj).eq("id",S.session.user.id);
    if(error){ ps.disabled=false; toast(erreur(error)); return; }
    if(S.photoNouvelle){ const r=await S.sb.from("photos").upsert({user_id:S.session.user.id, image:S.photoNouvelle, maj:new Date().toISOString()});
      if(r.error){ ps.disabled=false; toast("Fiche enregistrée, mais la photo n'a pas pu l'être : "+erreur(r.error)); return; } S.photoNouvelle=null; }
    S.saisie=null;
    try{ await chargerEtu(); }catch(e){}
    toast(identiteOk() ? "Fiche d'identité enregistrée." : "Fiche enregistrée. Il manque encore la photo ou la date de naissance pour les attestations.");
    render();
  };
  // restaure ce qui avait été tapé avant l'ajout de la photo
  if(S.saisie && document.getElementById("p-nn")) for(const [id,val] of Object.entries(S.saisie)){ const el=document.getElementById(id); if(el) el.value=val; }
}
function garderSaisie(){ S.saisie={}; document.querySelectorAll("#fiche input[type=text], #fiche input[type=date], #fiche select").forEach(el=>{ S.saisie[el.id]=el.value; }); }

// ---------- PDF ----------
const pdfTxt = s => String(s).replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/œ/g,"oe").replace(/Œ/g,"OE").replace(/[—–]/g,"-").replace(/…/g,"...").replace(/ /g," ").replace(/ /g," ");
const IMAGES_PDF = {};
async function imagePdf(url){
  if(!IMAGES_PDF[url]) IMAGES_PDF[url] = await fetch(url).then(r=>{ if(!r.ok) throw new Error(url); return r.blob(); })
    .then(b=>new Promise(ok=>{ const f=new FileReader(); f.onload=()=>ok(f.result); f.readAsDataURL(b); }));
  return IMAGES_PDF[url];
}
async function pdfPret(){
  if(!window.jspdf){ toast("Le module PDF n'a pas pu se charger. Rechargez la page."); return false; }
  if(!identiteOk()){ toast("Complétez d'abord votre fiche d'identité (nom de l'acte de naissance, date de naissance, photo)."); await go("parcours"); const f=document.getElementById("fiche"); if(f) f.scrollIntoView({block:"start"}); return false; }
  return true;
}
const nomOfficiel = () => (S.etu.identite.nomNaissance || S.etu.nom).trim();
// Attestation et diplôme : modèle du niveau (vert, bleu, pourpre, or et noir), voir attestation.js
const lienVerif = codes => location.origin + location.pathname + "#verifier=" + encodeURIComponent(codes.join(","));
async function attestationPdf(d){
  if(!window.HDF_ATTESTATION || !window.qrcode){ toast("Le modèle d'attestation n'a pas pu se charger. Rechargez la page."); return null; }
  const id=S.etu.identite, doc=new jspdf.jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  try{
    const sig = await imagePdf("marque/signature-houngbadji.png");
    await HDF_ATTESTATION.dessiner(doc, Object.assign({nom:nomOfficiel(), dateNaissance:HDF.dateLongue(id.dateNaissance), lieuNaissance:id.lieuNaissance||"",
      signature:sig, photo:S.photo, txt:pdfTxt}, d));
  }catch(e){ toast("Le modèle de l'attestation ou la signature n'a pas pu être chargé. Vérifiez votre connexion."); return null; }
  return doc;
}
function nomFichier(s){ return pdfTxt(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-"); }
async function pdfModule(m){
  if(!(await pdfPret())) return;
  const s=statut(m), i=niveauIndex(m.niveau);
  const doc = await attestationPdf({niveau:i, niveauNom:m.niveau.nom,
    phrase: s.parTest ? "pour avoir validé par le test de passage le module" : "pour avoir accompli avec succès le module",
    precision:`« ${m.titre} » du niveau`, note:(s.r.meilleur||0)*20, noteMot:"une note",
    date:fmtDate(s.r.certDate), code:s.r.certNo, lienQR:lienVerif([s.r.certNo])});
  if(!doc) return;
  doc.save(`Attestation-${m.id.toUpperCase()}-${nomFichier(nomOfficiel())}.pdf`);
}
async function pdfNiveau(n){
  if(!(await pdfPret())) return;
  const i=niveauIndex(n);
  const sc=n.modules.map(m=>statut(m).r.meilleur||0), moy=sc.reduce((a,b)=>a+b,0)/sc.length;
  const certs=n.modules.map(m=>statut(m).r), last=certs.map(r=>r.certDate).sort().pop(), nos=certs.map(r=>r.certNo);
  const doc = await attestationPdf({niveau:i, niveauNom:n.nom, phrase:"pour avoir accompli avec succès le niveau", precision:"",
    note:moy*20, noteMot:"une moyenne", date:fmtDate(last), code:nos.join(", "), libelleCode:"N° des attestations", lienQR:lienVerif(nos)});
  if(!doc) return;
  doc.save(`Diplome-Niveau${i}-${nomFichier(nomOfficiel())}.pdf`);
}

// ---------- démarrage ----------
async function demarrer(){
  try{
    const {prog, sb, horsLigne} = await HDF.connecter();
    S.prog = prog; R = HDF.regles(prog);
    fromHash(); // lu tout de suite : la déconnexion efface le # (lien de vérification d'un code QR)
    if(!sb){ $app.innerHTML = horsLigne ? HDF.HORS_LIGNE : HDF.CONFIG_MANQUANTE; return; }
    S.sb = sb;
    S.sb.auth.onAuthStateChange((event, session)=>{ setTimeout(()=>surSession(event, session), 0); });
    async function surSession(event, session){
      if(event==="PASSWORD_RECOVERY") S.recovery=true;
      const avant = S.session && S.session.user.id;
      S.session = session;
      if(session && session.user.id!==avant){ try{ await chargerEtu(); }catch(e){ toast(erreur(e)); } }
      if(!session){ S.etu={nom:"",eglise:"",modules:{},lecons:{},etapes:{},evaluations:{},tests:[]}; S.profil=null; S.suivi=null; S.photo=null; S.photoNouvelle=null; S.saisie=null; S.exam=null; S.test=null; S.lecon=null; if(S.view!=="verifier") S.view="parcours"; try{ history.replaceState(null,"",location.pathname); }catch(e){} }
      render();
    }
    const {data} = await S.sb.auth.getSession();
    S.session = data.session;
    fromHash();
    if(S.session){ await chargerEtu(); await allerDepuisHash(); } else render();
  }catch(e){
    $app.innerHTML = '<div class="empty">La plateforme n\'a pas pu démarrer. Rechargez la page.</div>';
  }
}
window.addEventListener("hashchange",()=>{ if(!S.prog) return; if(!S.session){ if(location.hash.startsWith("#verifier")){ fromHash(); render(); } return; } fromHash(); allerDepuisHash(); });
demarrer();
HDF.installation("etudiant");
})();

// Hauteur réelle de l'en-tête (plus haute sur téléphone) : le chrono reste visible juste dessous
(function(){ const h=document.querySelector("header.top"); if(!h) return;
  const maj=()=>document.documentElement.style.setProperty("--entete", h.offsetHeight+"px");
  maj(); if(window.ResizeObserver) new ResizeObserver(maj).observe(h); else window.addEventListener("resize", maj); })();
