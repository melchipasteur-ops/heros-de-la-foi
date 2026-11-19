// Régénère programme.json à partir des fichiers de niveaux : node contenu/build.js
const fs = require("fs"), path = require("path");
const niveaux = ["n1", "n2", "n3", "n4"].map(n => require(path.join(__dirname, n + ".js")));
fs.writeFileSync(path.join(__dirname, "..", "programme.json"), JSON.stringify({ niveaux }));
console.log("programme.json régénéré");
