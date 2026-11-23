// Attestations et diplômes « Héros de la Foi » : un modèle par niveau
// (vert = Nouveau converti, bleu = Disciple, pourpre = Serviteur, or et noir = Leader).
// Le décor est dessiné en SVG (vectoriel), rendu en haute définition sur un canvas puis posé en fond du PDF ;
// tous les textes sont écrits par jsPDF par-dessus, nets à l'impression.
(function(){
"use strict";

const COULEURS = {
  1: {fonce:"#0b4a20", moyen:"#1d7a35", clair:"#6dbb4f", pale:"#b9e3a0"},
  2: {fonce:"#0a2a6b", moyen:"#1b4fa8", clair:"#5b97e0", pale:"#b6d3f5"},
  3: {fonce:"#3c0a55", moyen:"#6b1f8c", clair:"#a75cc9", pale:"#dcbcea"},
  4: {fonce:"#050505", moyen:"#1c1c1c", clair:"#4a4436", pale:"#c9b98a"}
};

// ---------- Décor SVG (unités : millimètres, page A4 paysage 297 × 210) ----------
function laurier(cx, cy, sens){
  // Branche de laurier dorée qui monte en arc ; sens = 1 (gauche) ou -1 (droite)
  let s = `<g transform="translate(${cx} ${cy}) scale(${sens} 1)">`;
  s += `<path d="M0 0 C-6 -6 -8 -14 -5 -22" fill="none" stroke="url(#or)" stroke-width="0.9" stroke-linecap="round"/>`;
  const pts = [[-1.2,-3,-35],[-3.2,-6.5,-50],[-5,-10.5,-65],[-6,-14.5,-80],[-6,-18.5,-95],[-5.2,-22,-110]];
  for(const [x,y,a] of pts){
    s += `<ellipse cx="${x-2.6}" cy="${y}" rx="3.1" ry="1.25" transform="rotate(${a+60} ${x} ${y})" fill="url(#or)" stroke="#7a5512" stroke-width="0.15"/>`;
    s += `<ellipse cx="${x+2.4}" cy="${y-0.6}" rx="2.9" ry="1.15" transform="rotate(${a-20} ${x} ${y})" fill="url(#or)" stroke="#7a5512" stroke-width="0.15"/>`;
  }
  s += `<ellipse cx="-4.6" cy="-25" rx="1.3" ry="3" transform="rotate(-20 -4.6 -25)" fill="url(#or)" stroke="#7a5512" stroke-width="0.15"/>`;
  return s + `</g>`;
}

function coin(x, y, sx, sy){
  // Ornement doré dans un angle du cadre
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="url(#or)" stroke-linecap="round">
    <path d="M0 14 V0 H14" stroke-width="1.1"/>
    <path d="M3 18 C3 8 8 3 18 3" stroke-width="0.6"/>
    <path d="M4.5 4.5 C9 4.5 10 8 7.5 9.5 C5.5 10.5 4 8.5 5.5 7.5" stroke-width="0.6"/>
    <circle cx="2.2" cy="2.2" r="1.1" fill="url(#or)" stroke="none"/>
    <path d="M18 3 C22 3 23 5.5 21 6.5" stroke-width="0.5"/><path d="M3 18 C3 22 5.5 23 6.5 21" stroke-width="0.5"/>
  </g>`;
}

function sceau(cx, cy, r, c){
  let bosses = "";
  const n = 40;
  for(let i=0;i<n*2;i++){
    const a = Math.PI*i/n, rr = i%2 ? r : r*0.93;
    bosses += (i?"L":"M") + (cx+rr*Math.cos(a)).toFixed(2) + " " + (cy+rr*Math.sin(a)).toFixed(2) + " ";
  }
  const etoile = (x,y,t)=>{ let p=""; for(let i=0;i<10;i++){ const a=-Math.PI/2+Math.PI*i/5, q=i%2?t*0.45:t; p+=(i?"L":"M")+(x+q*Math.cos(a)).toFixed(2)+" "+(y+q*Math.sin(a)).toFixed(2)+" "; } return `<path d="${p}Z" fill="#5a3d08"/>`; };
  return `
  <g>
    <path d="M${cx-9} ${cy+8} L${cx-16} ${cy+r+12} L${cx-11} ${cy+r+8} L${cx-6.5} ${cy+r+13} L${cx-1} ${cy+10} Z" fill="${c.moyen}" stroke="url(#or)" stroke-width="0.6"/>
    <path d="M${cx+9} ${cy+8} L${cx+16} ${cy+r+12} L${cx+11} ${cy+r+8} L${cx+6.5} ${cy+r+13} L${cx+1} ${cy+10} Z" fill="${c.fonce}" stroke="url(#or)" stroke-width="0.6"/>
    <path d="${bosses}Z" fill="url(#orSceau)" stroke="#7a5512" stroke-width="0.35" filter="url(#ombre)"/>
    <circle cx="${cx}" cy="${cy}" r="${r*0.8}" fill="none" stroke="#8a6414" stroke-width="0.6"/>
    <circle cx="${cx}" cy="${cy}" r="${r*0.74}" fill="url(#orCentre)" stroke="#fff2b8" stroke-width="0.4"/>
    ${etoile(cx-4.5,cy-r*0.52,1.5)}${etoile(cx,cy-r*0.58,1.9)}${etoile(cx+4.5,cy-r*0.52,1.5)}
  </g>`;
}

function colombe(){
  return `<g transform="translate(246 6)">
    <circle cx="18" cy="17" r="22" fill="url(#halo)"/>
    <path d="M10 22 C2 20 -2 26 0 28 C4 26 8 27 10 28 Z" fill="#fff" stroke="#b9c2cf" stroke-width="0.3"/>
    <path d="M30 17 C24 25 15 29 8 27 C6 25 7 22 10 21 C16 20 22 17 26 14 C28 12 31 12 32 13 C33 14 32 16 30 17 Z" fill="#fff" stroke="#b9c2cf" stroke-width="0.35"/>
    <path d="M32 13 L35.5 13.8 L32.2 15 Z" fill="#e3a23a"/>
    <circle cx="30.2" cy="13.6" r="0.55" fill="#222"/>
    <path d="M24 16 C22 8 18 3 9 0 C13 5 13 9 14 12 C10 9 7 8 3 8 C8 12 12 16 17 20 Z" fill="#fff" stroke="#b9c2cf" stroke-width="0.35"/>
    <path d="M11 4 C14 7 16 11 19 16 M7 9 C11 12 14 15 17 19" stroke="#d6dde7" stroke-width="0.35" fill="none"/>
    <path d="M33 16 C36 19 37 22 36 25" stroke="#4f7a2a" stroke-width="0.5" fill="none"/>
    <ellipse cx="35.8" cy="19.5" rx="1.7" ry="0.7" transform="rotate(60 35.8 19.5)" fill="#5f8f2f"/>
    <ellipse cx="37" cy="22.8" rx="1.7" ry="0.7" transform="rotate(80 37 22.8)" fill="#5f8f2f"/>
    <ellipse cx="34.6" cy="23.2" rx="1.6" ry="0.65" transform="rotate(110 34.6 23.2)" fill="#5f8f2f"/>
    <circle cx="36.2" cy="25.6" r="0.6" fill="#b5463a"/>
  </g>`;
}

function bible(){
  let lignes = "";
  for(let i=0;i<9;i++){
    const y = 154.5 + i*1.7;
    lignes += `<path d="M${16+i*0.35} ${y+i*0.15} Q27 ${y-1.6} ${36} ${y+0.4}" stroke="#a89878" stroke-width="0.35" fill="none" opacity=".7"/>`;
    lignes += `<path d="M${40} ${y+0.4} Q49 ${y-1.6} ${60-i*0.35} ${y+i*0.15}" stroke="#a89878" stroke-width="0.35" fill="none" opacity=".7"/>`;
  }
  return `<g transform="translate(4 -6)"><g filter="url(#ombre)">
    <ellipse cx="38" cy="178" rx="34" ry="3.5" fill="#000" opacity=".18"/>
    <path d="M6 168 L38 176 L70 168 L72 173 L38 180.5 L4 173 Z" fill="#5a2e12"/>
    <path d="M7 167 L38 174.5 L69 167 L69.5 170 L38 177.5 L6.5 170 Z" fill="url(#or)"/>
    <path d="M10 151 C20 147 31 148 38 153 L38 174 C31 169 20 168 8 171 Z" fill="#fbf4e2" stroke="#c9b68e" stroke-width="0.3"/>
    <path d="M66 151 C56 147 45 148 38 153 L38 174 C45 169 56 168 68 171 Z" fill="#fbf4e2" stroke="#c9b68e" stroke-width="0.3"/>
    <path d="M12 153 C21 149.5 31 150 38 154.5 M64 153 C55 149.5 45 150 38 154.5" stroke="#e6d9b8" stroke-width="0.3" fill="none"/>
    ${lignes}
    <path d="M38 153 L38 174" stroke="#b8a57a" stroke-width="0.5"/>
    <path d="M38.6 154 C39.5 162 40.5 170 41.5 179" stroke="#9c1f1f" stroke-width="0.7" fill="none"/>
  </g>
  <circle cx="38" cy="155" r="16" fill="url(#halo)" opacity=".6"/></g>`;
}

function fond(niveau){
  const c = COULEURS[niveau] || COULEURS[1];
  const leader = niveau === 4;
  const orVague = leader ? "#e9c96a" : "url(#or)";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 297 210" width="297mm" height="210mm">
<defs>
  <radialGradient id="papier" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#fffcf2"/><stop offset=".6" stop-color="#fbf3dd"/><stop offset="1" stop-color="#efdfb6"/></radialGradient>
  <linearGradient id="or" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6414"/><stop offset=".25" stop-color="#f6dc85"/><stop offset=".5" stop-color="#b8862b"/><stop offset=".75" stop-color="#fff0a8"/><stop offset="1" stop-color="#9a6f1c"/></linearGradient>
  <linearGradient id="orLigne" gradientUnits="userSpaceOnUse" x1="92" y1="0" x2="212" y2="0"><stop offset="0" stop-color="#b8862b" stop-opacity="0"/><stop offset=".2" stop-color="#c99a35"/><stop offset=".5" stop-color="#f1d277"/><stop offset=".8" stop-color="#c99a35"/><stop offset="1" stop-color="#b8862b" stop-opacity="0"/></linearGradient>
  <linearGradient id="orV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".45" stop-color="#d4a640"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
  <radialGradient id="orSceau" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff4bf"/><stop offset=".45" stop-color="#e2b54a"/><stop offset="1" stop-color="#94680f"/></radialGradient>
  <radialGradient id="orCentre" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#fff1b5"/><stop offset=".6" stop-color="#e9c25a"/><stop offset="1" stop-color="#b98a26"/></radialGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff8e0" stop-opacity=".55"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></radialGradient>
  <linearGradient id="ruban" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.clair}"/><stop offset=".45" stop-color="${c.moyen}"/><stop offset="1" stop-color="${c.fonce}"/></linearGradient>
  <linearGradient id="vagueG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.moyen}"/><stop offset=".6" stop-color="${c.fonce}"/><stop offset="1" stop-color="${c.fonce}"/></linearGradient>
  <linearGradient id="vagueC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.pale}" stop-opacity=".2"/><stop offset=".5" stop-color="${c.clair}" stop-opacity=".75"/><stop offset="1" stop-color="${c.moyen}"/></linearGradient>
  <linearGradient id="vagueD" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.pale}" stop-opacity=".2"/><stop offset=".55" stop-color="${c.clair}" stop-opacity=".8"/><stop offset="1" stop-color="${c.fonce}"/></linearGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.2  0 0 0 0.09 0"/></filter>
  <filter id="ombre" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="0.6" stdDeviation="0.6" flood-color="#3a2a08" flood-opacity=".35"/></filter>
</defs>
<rect width="297" height="210" fill="url(#papier)"/>
<rect width="297" height="210" filter="url(#grain)"/>

<!-- croix estompée -->
<g opacity=".16" fill="#a08a5c"><rect x="268.5" y="86" width="5" height="42" rx=".6"/><rect x="259" y="95" width="24" height="4.6" rx=".6"/><path d="M246 140 C258 126 280 124 297 132 L297 140 Z"/></g>

<!-- vagues de couleur -->
<path d="M0 92 C10 140 8 178 36 191 C62 199 120 196 297 187 L297 210 L0 210 Z" fill="url(#vagueC)" opacity=".55"/>
<path d="M0 120 C6 160 10 186 40 194.5 C70 200 130 196 297 192 L297 210 L0 210 Z" fill="url(#vagueG)"/>
<path d="M0 120 C6 160 10 186 40 194.5 C70 200 130 196 297 192" fill="none" stroke="${orVague}" stroke-width="1.1"/>
<path d="M0 150 C4 174 14 192 50 197 C80 200 140 197 297 196 L297 210 L0 210 Z" fill="${c.fonce}"/>
<path d="M0 150 C4 174 14 192 50 197 C80 200 140 197 297 196" fill="none" stroke="${orVague}" stroke-width="0.5" opacity=".9"/>
<path d="M297 78 C284 116 282 150 256 178 C238 196 210 202 180 210 L297 210 Z" fill="url(#vagueD)" opacity=".6"/>
<path d="M297 104 C288 138 282 166 258 186 C244 198 222 205 196 210 L297 210 Z" fill="url(#vagueG)"/>
<path d="M297 104 C288 138 282 166 258 186 C244 198 222 205 196 210" fill="none" stroke="${orVague}" stroke-width="1.1"/>
<path d="M297 136 C291 160 284 180 266 193 C252 203 236 207 220 210 L297 210 Z" fill="${c.fonce}"/>
<path d="M297 136 C291 160 284 180 266 193 C252 203 236 207 220 210" fill="none" stroke="${orVague}" stroke-width="0.5"/>

${colombe()}
${bible()}

<!-- bandeau du titre -->
<path d="M66 49 L56 49 L61 56.5 L56 64 L70 64 Z" fill="${c.fonce}" stroke="url(#or)" stroke-width="0.6"/>
<path d="M238 49 L248 49 L243 56.5 L248 64 L234 64 Z" fill="${c.fonce}" stroke="url(#or)" stroke-width="0.6"/>
<path d="M74 45.5 L230 45.5 L240 55.5 L230 65.5 L74 65.5 L64 55.5 Z" fill="url(#ruban)" stroke="url(#or)" stroke-width="1.5" filter="url(#ombre)"/>
<path d="M75.5 47.6 L228.5 47.6 L236.6 55.5 L228.5 63.4 L75.5 63.4 L67.4 55.5 Z" fill="none" stroke="#f3d77a" stroke-width="0.35" opacity=".9"/>
${laurier(58, 82, 1)}${laurier(246, 82, -1)}

<!-- trait sous le nom -->
<path d="M92 103 H147.5 M156.5 103 H212" stroke="url(#orLigne)" stroke-width="0.7"/>
<path d="M152 100.4 L154.6 103 L152 105.6 L149.4 103 Z" fill="url(#or)" stroke="#8a6414" stroke-width="0.2"/>

<!-- pastille du niveau -->
<rect x="108" y="122.5" width="88" height="13" rx="6.5" fill="url(#ruban)" stroke="url(#or)" stroke-width="1.3" filter="url(#ombre)"/>
<rect x="109.6" y="124.1" width="84.8" height="9.8" rx="4.9" fill="none" stroke="#f3d77a" stroke-width="0.3" opacity=".8"/>

${sceau(262, 168, 19, c)}

<!-- médaillon du logo -->
<circle cx="35" cy="31" r="21.5" fill="url(#or)" filter="url(#ombre)"/>
<circle cx="35" cy="31" r="19.6" fill="#2a1d10"/>

<!-- cadre doré -->
<rect x="3.5" y="3.5" width="290" height="203" fill="none" stroke="url(#or)" stroke-width="3"/>
<rect x="1.8" y="1.8" width="293.4" height="206.4" fill="none" stroke="#7a5512" stroke-width="0.35"/>
<rect x="7.4" y="7.4" width="282.2" height="195.2" fill="none" stroke="url(#or)" stroke-width="0.6"/>
${coin(8.8,8.8,1,1)}${coin(288.2,8.8,-1,1)}${coin(8.8,201.2,1,-1)}${coin(288.2,201.2,-1,-1)}
</svg>`;
}

// SVG -> image JPEG haute définition (environ 260 points par pouce en A4)
const CACHE = {};
function fondImage(niveau, largeurPx){
  const L = largeurPx || 3000, cle = niveau + ":" + L;
  if(CACHE[cle]) return CACHE[cle];
  CACHE[cle] = new Promise((ok, ko)=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const cv = document.createElement("canvas");
        cv.width = L; cv.height = Math.round(L*210/297);
        const cx = cv.getContext("2d");
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL("image/jpeg", 0.86));
      }catch(e){ ko(e); }
    };
    img.onerror = ()=>ko(new Error("Décor de l'attestation"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(fond(niveau));
  });
  CACHE[cle].catch(()=>{ delete CACHE[cle]; });
  return CACHE[cle];
}

function mention(note){
  return note >= 18 ? "Excellent" : note >= 16 ? "Très bien" : note >= 14 ? "Bien" : note >= 12 ? "Assez bien" : "Passable";
}

// Écrit un texte centré en réduisant la taille si besoin pour tenir dans la largeur
function centre(doc, t, x, y, taille, largeur, mini){
  doc.setFontSize(taille);
  while(taille > (mini || 6) && doc.getTextWidth(t) > largeur){ taille -= 0.5; doc.setFontSize(taille); }
  doc.text(t, x, y, {align:"center"});
}

/*
  d = {
    niveau: 1..4, niveauNom, titre ("ATTESTATION DE RÉUSSITE" | "DIPLÔME DE NIVEAU"),
    nom, naissance (ligne « Né le … »), phrase, precision (ex. titre du module, ou vide),
    note (sur 20, nombre), noteMot ("une note" | "une moyenne"), date (texte), code,
    logo (dataURL JPEG), signature (dataURL PNG), photo (dataURL JPEG ou null),
    responsable, fonction, verification (ex. "monsite.org/#verifier"), txt (fonction de nettoyage pour jsPDF)
  }
*/
async function dessiner(doc, d){
  const W = 297, X = 152, T = d.txt || (s=>String(s)), c = COULEURS[d.niveau] || COULEURS[1];
  const fondJpg = await fondImage(d.niveau);
  doc.addImage(fondJpg, "JPEG", 0, 0, W, 210, undefined, "FAST");
  // logo dans son médaillon (rond découpé)
  doc.saveGraphicsState();
  doc.circle(35, 31, 19.6, null); doc.clip(); doc.discardPath();
  doc.addImage(d.logo, "JPEG", 15.4, 11.4, 39.2, 39.2);
  doc.restoreGraphicsState();

  const encre = [20,30,72];
  doc.setTextColor(...encre);
  doc.setFont("times","bold"); centre(doc, T("HÉROS DE LA FOI"), X, 25, 30, 150);
  doc.setFontSize(14.5); doc.text(T("Formation théologique"), X, 35, {align:"center"});
  const lt = doc.getTextWidth(T("Formation théologique"))/2;
  doc.setDrawColor(20,30,72); doc.setLineWidth(0.4); doc.line(X-lt-15, 33.6, X-lt-3, 33.6); doc.line(X+lt+3, 33.6, X+lt+15, 33.6);

  doc.setTextColor(255,255,255); doc.setFont("times","bold"); centre(doc, T(d.titre), X, 58.6, 23, 150);

  doc.setTextColor(...encre); doc.setFont("times","bold"); doc.setFontSize(13);
  doc.text(T(d.decerne || "Décernée à"), X, 74, {align:"center"});
  doc.setFont("times","bolditalic"); centre(doc, T(d.nom), X, 94, 34, 170);
  if(d.naissance){ doc.setFont("times","italic"); doc.setTextColor(70,70,90); centre(doc, T(d.naissance), X, 109, 9.5, 170); }

  doc.setTextColor(...encre); doc.setFont("times","bold");
  centre(doc, T(d.phrase), X, d.precision ? 114.5 : 117, 13, 170);
  if(d.precision){ doc.setFont("times","bolditalic"); centre(doc, T(d.precision), X, 120, 12, 175); }

  doc.setTextColor(255,255,255); doc.setFont("times","bold"); centre(doc, T(d.niveauNom.toUpperCase()), X, 131.6, 16, 78);

  // « avec la mention X et une note de N/20 » : mention soulignée
  doc.setTextColor(...encre); doc.setFontSize(12.5);
  const note = (Math.round(d.note*10)/10).toString().replace(".", ",") + "/20";
  const m = mention(d.note);
  const parts = [["avec la mention ","bold"],[m,"bolditalic"],[` et ${d.noteMot||"une note"} de `,"bold"],[note,"bold"]];
  let tot = 0; for(const [s,f] of parts){ doc.setFont("times",f); tot += doc.getTextWidth(T(s)); }
  let x = X - tot/2;
  for(const [s,f] of parts){
    doc.setFont("times",f); doc.text(T(s), x, 144);
    const w = doc.getTextWidth(T(s));
    if(s===m){ doc.setLineWidth(0.3); doc.line(x, 145, x+w, 145); }
    x += w;
  }

  doc.setFont("times","bolditalic"); doc.setFontSize(11); doc.setTextColor(60,55,70);
  doc.text(T("« J'ai combattu le bon combat, j'ai achevé la course,"), X, 154, {align:"center"});
  doc.text(T("j'ai gardé la foi. » 2 Timothée 4.7 (LSG)"), X, 159.5, {align:"center"});

  // photo d'identité (sous la colombe)
  if(d.photo){
    doc.addImage(d.photo, "JPEG", 266, 50, 19, 25.3);
    doc.setDrawColor(184,134,43); doc.setLineWidth(0.8); doc.rect(266, 50, 19, 25.3);
  }

  // date
  doc.setTextColor(...encre); doc.setFont("times","bold"); doc.setFontSize(11.5);
  doc.text(T("Fait le " + d.date), 50, 187.5, {align:"center"});

  // signature
  if(d.signature) doc.addImage(d.signature, "PNG", 138, 162.5, 26, 22.2);
  doc.setDrawColor(60,60,80); doc.setLineWidth(0.3); doc.line(112, 184, 192, 184);
  doc.setFont("times","bold"); doc.setFontSize(9.5); doc.setTextColor(...encre);
  doc.text(T(d.responsable), X, 188, {align:"center"});
  doc.setFont("times","normal"); doc.setFontSize(9); doc.text(T("Le " + d.fonction.charAt(0).toLowerCase() + d.fonction.slice(1)), X, 192, {align:"center"});

  // sceau
  doc.setTextColor(58,38,6); doc.setFont("times","bold");
  doc.setFontSize(12.5); doc.text(T("Héros"), 262, 167, {align:"center"});
  doc.text(T("de la Foi"), 262, 172, {align:"center"});
  doc.setFontSize(7.5); doc.text(T("Attestation"), 262, 176.2, {align:"center"}); doc.text(T("officielle"), 262, 179.4, {align:"center"});

  // numéro de vérification, sur la bande de couleur
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold");
  const pied = T(`${d.libelleCode || "N° d'attestation"} : ${d.code} ; vérifiable en ligne sur ${d.verification}`);
  centre(doc, pied, X, 200.4, 8, 165, 4.5);
}

window.HDF_ATTESTATION = {dessiner, fond, fondImage, mention, COULEURS};
})();
