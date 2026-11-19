// Vérifie un ou plusieurs modules v2 : node valider.js n1m1.json [n1m2.json …]
// (sans argument : tous les fichiers n*m*.json du dossier)
const fs = require("fs"), path = require("path");
const dir = __dirname;
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => /^n\d+m\d+\.json$/.test(f)).sort();
const mots = s => String(s || "").split(/\s+/).filter(Boolean).length;
const somme = arr => (arr || []).reduce((a, x) => a + mots(typeof x === "string" ? x : (x.paragraphes || []).join(" ")), 0);
let total = 0, ko = 0;
for (const f of files) {
  const p = path.isAbsolute(f) ? f : path.join(dir, path.basename(f));
  const err = [], warn = [];
  let m;
  try { m = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.log(`✗ ${f} : JSON invalide (${e.message})`); ko++; continue; }
  const req = (cond, msg) => { if (!cond) err.push(msg); };
  req(/^n[1-4]m[1-6]$/.test(m.id || ""), "id invalide");
  req(m.titre && m.objectif, "titre/objectif manquants");
  req(Array.isArray(m.introduction) && m.introduction.length >= 2, "introduction : au moins 2 paragraphes");
  req(Array.isArray(m.lecturesObligatoires) && m.lecturesObligatoires.length >= 6, "lecturesObligatoires : au moins 6");
  req(Array.isArray(m.lecons) && m.lecons.length >= 3 && m.lecons.length <= 4, "3 ou 4 leçons");
  let motsModule = somme(m.introduction);
  (m.lecons || []).forEach((l, i) => {
    const t = `leçon ${i + 1}`;
    req(l.titre, `${t} : titre`);
    req((l.lectures || []).length >= 2, `${t} : au moins 2 lectures`);
    req(l.recit && l.recit.ref && (l.recit.paragraphes || []).length >= 2 && (l.recit.lecons || []).length >= 2, `${t} : récit incomplet`);
    req((l.exegese || []).length >= 2, `${t} : exégèse (au moins 2 sections)`);
    req((l.motsCles || []).length >= 2, `${t} : motsCles (au moins 2)`);
    req((l.enseignement || []).length >= 2, `${t} : enseignement (au moins 2 sections)`);
    req((l.citations || []).length >= 1, `${t} : citations`);
    req((l.application || []).length >= 3, `${t} : application (au moins 3)`);
    req(l.etudeDeCas && l.etudeDeCas.situation && (l.etudeDeCas.questions || []).length >= 2, `${t} : étude de cas`);
    req((l.reflexion || []).length >= 3, `${t} : réflexion (au moins 3)`);
    req((l.retenir || []).length >= 3, `${t} : à retenir (au moins 3)`);
    req(l.memoriser && l.memoriser.ref && l.memoriser.texte, `${t} : verset à mémoriser`);
    req(l.priere, `${t} : prière`);
    const n = mots((l.recit && l.recit.paragraphes || []).join(" ")) + somme(l.exegese) + somme(l.enseignement) + somme(l.application) + mots(l.etudeDeCas && l.etudeDeCas.situation);
    motsModule += n;
    if (n < 2500) warn.push(`${t} : ${n} mots (visé : 2 500 à 4 000)`);
    if (mots((l.recit && l.recit.paragraphes || []).join(" ")) < 300) warn.push(`${t} : récit court`);
    if (somme(l.exegese) < 500) warn.push(`${t} : exégèse courte`);
  });
  req(m.pratique && m.pratique.consigne && (m.pratique.etapes || []).length >= 2, "pratique incomplète");
  req(Array.isArray(m.examen) && m.examen.length === 20, `examen : ${m.examen ? m.examen.length : 0} questions (il en faut 20)`);
  const pos = [0, 0, 0, 0]; let vf = 0;
  (m.examen || []).forEach((q, i) => {
    req(q.q && Array.isArray(q.choix) && (q.choix.length === 4 || q.choix.length === 2), `question ${i + 1} : 4 choix (ou 2)`);
    req(Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < (q.choix || []).length, `question ${i + 1} : index « bonne » invalide`);
    req(new Set(q.choix || []).size === (q.choix || []).length, `question ${i + 1} : choix en double`);
    req(q.explication, `question ${i + 1} : explication`);
    if ((q.choix || []).length === 2) vf++; else pos[q.bonne]++;
  });
  if (vf > 4) warn.push(`${vf} questions Vrai/Faux (max conseillé : 4)`);
  if (Math.max(...pos) > 8) warn.push(`bonnes réponses mal réparties sur les positions : ${pos.join("/")}`);
  if (/Segond 21|\bS21\b|Colombe|Semeur/i.test(JSON.stringify(m))) warn.push("mention d'une traduction protégée : n'utiliser que Louis Segond 1910");
  total += motsModule;
  if (err.length) ko++;
  console.log(`${err.length ? "✗" : "✓"} ${f} : ${motsModule} mots, ${(m.lecons || []).length} leçons, ${(m.examen || []).length} questions`);
  err.forEach(e => console.log("   ERREUR  " + e));
  warn.forEach(w => console.log("   attention " + w));
}
console.log(`\n${files.length} fichier(s), ${ko} avec erreurs, ${total} mots au total.`);
process.exitCode = ko ? 1 : 0;
