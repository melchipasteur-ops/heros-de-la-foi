// Régénère, à partir des fichiers de niveaux :
//  - programme.json            : le contenu public des cours, SANS les réponses des examens
//  - supabase/cles_examen.sql  : les réponses, à exécuter dans Supabase (jamais envoyées au navigateur)
// Usage : node contenu/build.js
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, "..");
const niveaux = ["n1", "n2", "n3", "n4"].map(n => require(path.join(__dirname, n + ".js")));

const sql = ["-- Généré par contenu/build.js : ne pas modifier à la main.",
  "-- À exécuter dans Supabase > SQL Editor après schema.sql (et après chaque modification des examens).",
  "begin;", "delete from public.cles_examen;"];
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

const publicNiveaux = niveaux.map(n => ({
  ...n,
  modules: n.modules.map(m => {
    m.examen.forEach(([, choix, bonne], i) => {
      if (bonne >= choix.length) throw new Error("Réponse invalide : " + m.id + " question " + i);
      sql.push(`insert into public.cles_examen (module_id, question, reponse) values (${q(m.id)}, ${i}, ${q(choix[bonne])});`);
    });
    return { ...m, examen: m.examen.map(([question, choix]) => [question, choix]) };
  })
}));
sql.push("commit;");

fs.writeFileSync(path.join(racine, "programme.json"), JSON.stringify({ niveaux: publicNiveaux }));
fs.mkdirSync(path.join(racine, "supabase"), { recursive: true });
fs.writeFileSync(path.join(racine, "supabase", "cles_examen.sql"), sql.join("\n") + "\n");
console.log("programme.json et supabase/cles_examen.sql régénérés");
