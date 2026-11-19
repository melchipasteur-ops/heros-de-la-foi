// Régénère tout ce que publie la plateforme, à partir du contenu source :
//  - programme.json            : la liste des niveaux et modules (sans les leçons ni les réponses)
//  - modules/<id>.json         : le cours complet d'un module, SANS les réponses des examens
//  - supabase/cles_examen.sql  : ordre des modules + réponses et explications (jamais envoyées au navigateur)
//  - supabase/*_une_commande.sql : mêmes scripts en une seule commande
// Source : contenu/v2/<id>.json (format approfondi, voir contenu/v2/FORMAT.md) ;
// à défaut, l'ancienne version courte contenu/n1.js … n4.js.
// Usage : node contenu/build.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const racine = path.join(__dirname, "..");
const v2dir = path.join(__dirname, "v2");
const anciens = ["n1", "n2", "n3", "n4"].map(n => require(path.join(__dirname, n + ".js")));
// Ordre des modules dans chaque niveau (contenu/ordre.json). Un module listé mais pas encore rédigé est ignoré.
const ordreNiveaux = JSON.parse(fs.readFileSync(path.join(__dirname, "ordre.json"), "utf8"));

// Convertit un module court (ancien format) vers la structure v2
function depuisAncien(m) {
  return {
    id: m.id, titre: m.titre, objectif: m.objectif, introduction: [], lecturesObligatoires: [],
    lecons: m.lecons.map(l => ({
      titre: l.titre,
      lectures: l.versets.map(ref => ({ ref })),
      enseignement: [{ titre: "", paragraphes: l.texte }],
      application: [{ titre: "Application", paragraphes: [l.application] }],
      retenir: [l.retenir]
    })),
    pratique: { consigne: m.pratique, etapes: [] },
    examen: m.examen.map(([q, choix, bonne]) => ({ q, choix, bonne, explication: "" })),
    version: 1
  };
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const sql = ["-- Généré par contenu/build.js : ne pas modifier à la main.",
  "-- À exécuter dans Supabase > SQL Editor après schema.sql (et après chaque modification du contenu).",
  "begin;", "delete from public.cles_examen;", "delete from public.modules;"];
fs.mkdirSync(path.join(racine, "modules"), { recursive: true });

let ordre = 0, nbV2 = 0;
const modRows = [], cleRows = [];
const index = anciens.map((n, ni) => ({
  id: n.id, nom: n.nom, sousTitre: n.sousTitre, verset: n.verset, description: n.description,
  modules: (ordreNiveaux[n.id] || n.modules.map(x => x.id)).filter(id => {
    const ok = fs.existsSync(path.join(v2dir, id + ".json")) || n.modules.some(x => x.id === id);
    if (!ok) console.log(`(module ${id} pas encore rédigé : ignoré)`);
    return ok;
  }).map(id => {
    const ancien = n.modules.find(x => x.id === id);
    const f = path.join(v2dir, id + ".json");
    const m = fs.existsSync(f) ? { ...JSON.parse(fs.readFileSync(f, "utf8")), version: 2 } : depuisAncien(ancien);
    if (m.version === 2) nbV2++;
    ordre++;
    sql.push(`insert into public.modules (id, niveau, ordre, nb_lecons) values (${q(m.id)}, ${ni + 1}, ${ordre}, ${m.lecons.length});`);
    modRows.push(`(${q(m.id)}, ${ni + 1}, ${ordre}, ${m.lecons.length})`);
    m.examen.forEach((x, i) => {
      if (!(x.bonne >= 0 && x.bonne < x.choix.length)) throw new Error(`Réponse invalide : ${m.id} question ${i}`);
      sql.push(`insert into public.cles_examen (module_id, question, reponse, explication) values (${q(m.id)}, ${i}, ${q(x.choix[x.bonne])}, ${q(x.explication || "")});`);
      cleRows.push(`(${q(m.id)}, ${i}, ${q(x.choix[x.bonne])}, ${q(x.explication || "")})`);
    });
    const publicModule = { ...m, examen: m.examen.map(x => ({ q: x.q, choix: x.choix })) };
    fs.writeFileSync(path.join(racine, "modules", m.id + ".json"), JSON.stringify(publicModule));
    return {
      id: m.id, titre: m.titre, objectif: m.objectif, lecons: m.lecons.map(l => l.titre),
      pratique: m.pratique.consigne, nbQuestions: m.examen.length, version: m.version
    };
  })
}));
sql.push("commit;");

fs.writeFileSync(path.join(racine, "programme.json"), JSON.stringify({ niveaux: index }));
fs.writeFileSync(path.join(racine, "supabase", "cles_examen.sql"), sql.join("\n") + "\n");
for (const nom of ["schema", "cles_examen"]) {
  execFileSync("python3", [path.join(__dirname, "une_commande.py"),
    path.join(racine, "supabase", nom + ".sql"), path.join(racine, "supabase", nom + "_une_commande.sql")], { stdio: "inherit" });
}
// Version en plusieurs parties : chaque fichier = UNE commande de moins de 60 000 caractères
// (l'éditeur SQL refuse plusieurs commandes et les requêtes de plus de 100 000 caractères).
// Chaque partie peut être relancée sans risque (mise à jour si la ligne existe déjà).
const dossier = path.join(racine, "supabase", "parties");
fs.rmSync(dossier, { recursive: true, force: true }); fs.mkdirSync(dossier, { recursive: true });
// Partie 01 : un seul bloc DO qui (1) retire l'ancienne contrainte d'unicité de l'ordre (sinon l'insertion d'un module échoue),
// (2) enregistre les modules dans le bon ordre, (3) délivre les attestations manquantes aux étudiants qui ont réussi un test de passage.
const parties = [`do $hdf$ begin
alter table public.modules drop constraint if exists modules_ordre_key;
insert into public.modules (id, niveau, ordre, nb_lecons) values\n${modRows.join(",\n")}\non conflict (id) do update set niveau = excluded.niveau, ordre = excluded.ordre, nb_lecons = excluded.nb_lecons;
insert into public.progression (user_id, module_id, meilleur, dernier, date_examen, tentatives, cert_no, cert_date, origine)
select t.user_id, m.id, t.note20 / 20, t.note20 / 20, now(), 0,
       'HDF-' || upper(m.id) || '-' || upper(substr(md5(t.user_id::text || m.id || clock_timestamp()::text), 1, 6)), now(), 'test'
  from (select distinct on (user_id, niveau) user_id, niveau, note20 from public.tests_passage where reussi order by user_id, niveau, note20 desc) t
  join public.modules m on m.niveau = t.niveau
 where not exists (select 1 from public.progression g where g.user_id = t.user_id and g.module_id = m.id and g.cert_no is not null)
on conflict (user_id, module_id) do update
  set meilleur = greatest(progression.meilleur, excluded.meilleur),
      cert_no = coalesce(progression.cert_no, excluded.cert_no),
      cert_date = coalesce(progression.cert_date, excluded.cert_date),
      origine = case when progression.cert_no is null then 'test' else progression.origine end;
end $hdf$;`];
const fin = "\non conflict (module_id, question) do update set reponse = excluded.reponse, explication = excluded.explication;";
let lot = [];
const vider = () => { if (lot.length) parties.push(`insert into public.cles_examen (module_id, question, reponse, explication) values\n${lot.join(",\n")}${fin}`); lot = []; };
for (const r of cleRows) { if ((lot.join(",\n") + r).length > 55000) vider(); lot.push(r); }
vider();
parties.forEach((c, i) => {
  const nom = `cles_partie_${String(i + 1).padStart(2, "0")}_sur_${String(parties.length).padStart(2, "0")}.sql`;
  if (c.length > 60000) throw new Error(nom + " trop long");
  fs.writeFileSync(path.join(dossier, nom), c + "\n");
});
console.log(`supabase/parties : ${parties.length} fichiers`);
console.log(`programme.json, modules/ (${ordre} modules dont ${nbV2} approfondis) et SQL régénérés`);
