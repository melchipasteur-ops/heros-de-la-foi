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
const index = anciens.map((n, ni) => ({
  id: n.id, nom: n.nom, sousTitre: n.sousTitre, verset: n.verset, description: n.description,
  modules: n.modules.map(ancien => {
    const f = path.join(v2dir, ancien.id + ".json");
    const m = fs.existsSync(f) ? { ...JSON.parse(fs.readFileSync(f, "utf8")), version: 2 } : depuisAncien(ancien);
    if (m.version === 2) nbV2++;
    ordre++;
    sql.push(`insert into public.modules (id, niveau, ordre, nb_lecons) values (${q(m.id)}, ${ni + 1}, ${ordre}, ${m.lecons.length});`);
    m.examen.forEach((x, i) => {
      if (!(x.bonne >= 0 && x.bonne < x.choix.length)) throw new Error(`Réponse invalide : ${m.id} question ${i}`);
      sql.push(`insert into public.cles_examen (module_id, question, reponse, explication) values (${q(m.id)}, ${i}, ${q(x.choix[x.bonne])}, ${q(x.explication || "")});`);
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
console.log(`programme.json, modules/ (${ordre} modules dont ${nbV2} approfondis) et SQL régénérés`);
