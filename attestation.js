// Attestations et diplômes « Héros de la Foi » : les 4 modèles fournis, un par niveau
// (vert = Nouveau converti, bleu = Disciple, pourpre = Serviteur, or et noir = Leader).
// Le fond est l'image du modèle (marque/attestations/niveauN.jpg) dont on a seulement effacé les champs
// entre crochets ; les vraies données sont écrites par-dessus par jsPDF, avec un code QR de vérification.
// Coordonnées des zones relevées en pixels sur les images (1491 × 1055), converties en mm (A4 paysage).
(function(){
"use strict";

const PX = 297 / 1491;            // mm par pixel de l'image
const mm = v => v * PX;
const ENCRE = [15, 22, 70];      // bleu nuit du texte des modèles

// [x0, y, x1] des traits à compléter, [x0, y0, x1, y1] du cadre photo, etc. (pixels)
const ZONES = {
  1: {nomY:403, phrase:493, pill:[745,546], mention:619, pied:[744,1010],
      naissance:[507,672,704], lieu:[979,671,1167], fait:[239,929,438], signature:[498,893,1008], photo:[48,317,255,610]},
  2: {nomY:400, phrase:493, pill:[748,546], mention:621, pied:[745,1018],
      naissance:[493,675,706], lieu:[978,675,1182], fait:[223,939,436], signature:[484,892,1012], photo:[39,317,255,625]},
  3: {nomY:400, phrase:493, pill:[748,546], mention:621, pied:[744,1014],
      naissance:[495,672,704], lieu:[988,671,1181], fait:[231,928,425], signature:[483,892,1010], photo:[42,311,255,608]},
  4: {nomY:398, phrase:490, pill:[747,542], mention:617, pied:[742,1014],
      naissance:[484,666,701], lieu:[985,667,1185], fait:[236,931,449], signature:[491,888,1008], photo:[33,317,249,611]}
};
// Phrases d'origine des modèles et leur largeur (pixels), pour retrouver la même taille de caractères
const REF = {
  phrase: ["pour avoir accompli avec succès le niveau", 754],
  mention: ["avec la mention [MENTION] et une note de [NOTE]/20", 832],
  pied: ["N° d'attestation : [CODE] ; vérifiable en ligne", 539]
};

const CACHE = {};
function fondImage(niveau){
  const url = "marque/attestations/niveau" + niveau + ".jpg";
  if(!CACHE[url]){
    CACHE[url] = fetch(url).then(r=>{ if(!r.ok) throw new Error(url); return r.blob(); })
      .then(b=>new Promise((ok,ko)=>{ const f=new FileReader(); f.onload=()=>ok(f.result); f.onerror=ko; f.readAsDataURL(b); }));
    CACHE[url].catch(()=>{ delete CACHE[url]; });
  }
  return CACHE[url];
}

function mention(note){
  return note >= 18 ? "Excellent" : note >= 16 ? "Très bien" : note >= 14 ? "Bien" : note >= 12 ? "Assez bien" : "Passable";
}

function tailleRef(doc, cle, police){
  const [t, l] = REF[cle];
  doc.setFont("times", police || "bold"); doc.setFontSize(10);
  return 10 * mm(l) / doc.getTextWidth(t);
}
// Texte centré, réduit si besoin pour tenir dans la largeur
function centre(doc, t, x, y, taille, largeur, mini){
  doc.setFontSize(taille);
  while(taille > (mini || 6) && doc.getTextWidth(t) > largeur){ taille -= 0.25; doc.setFontSize(taille); }
  doc.text(t, x, y, {align:"center"});
}
// Texte posé sur un trait « ______ » : aligné à gauche, réduit pour tenir sur le trait
function surTrait(doc, t, [x0, y, x1], taille){
  if(!t) return;
  doc.setFont("times","bold"); doc.setFontSize(taille);
  const L = mm(x1 - x0) - 2;
  while(taille > 6 && doc.getTextWidth(t) > L){ taille -= 0.25; doc.setFontSize(taille); }
  doc.text(t, mm(x0) + Math.max(1, (L - doc.getTextWidth(t))/2), mm(y) - 0.8);
}

// Code QR vectoriel (net à toute taille) sur fond blanc
function qr(doc, texte, x, y, cote){
  const q = qrcode(0, "M"); q.addData(texte); q.make();
  const n = q.getModuleCount(), marge = 1.6, m = (cote - 2*marge) / n;
  doc.setFillColor(255,255,255); doc.setDrawColor(184,134,43); doc.setLineWidth(0.6);
  doc.roundedRect(x, y, cote, cote, 1.2, 1.2, "FD");
  doc.setFillColor(...ENCRE);
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) doc.rect(x+marge+c*m, y+marge+r*m, m+0.02, m+0.02, "F");
}

/*
  d = {
    niveau: 1..4, niveauNom, nom, dateNaissance (texte), lieuNaissance,
    phrase (ex. « pour avoir accompli avec succès le niveau »), precision (titre du module, ou vide),
    note (sur 20), noteMot ("une note" | "une moyenne"), date (texte), code, lienQR,
    signature (dataURL PNG), photo (dataURL JPEG ou null), txt (nettoyage du texte pour jsPDF)
  }
*/
async function dessiner(doc, d){
  const T = d.txt || (s=>String(s)), Z = ZONES[d.niveau] || ZONES[1];
  doc.addImage(await fondImage(d.niveau), "JPEG", 0, 0, 297, 210, undefined, "FAST");

  // photo d'identité : remplit tout le cadre (le libellé « Photo d'identité » du modèle est recouvert)
  if(d.photo){
    const [a,b,c,e] = Z.photo.map(mm), w = c-a, h = e-b;
    const p = doc.getImageProperties(d.photo), k = Math.max(w/p.width, h/p.height);
    const pw = p.width*k, ph = p.height*k;
    doc.saveGraphicsState();
    doc.roundedRect(a, b, w, h, 3.2, 3.2, null); doc.clip(); doc.discardPath();
    // centrée horizontalement ; verticalement, on garde le haut (le visage) si la photo dépasse
    doc.addImage(d.photo, "JPEG", a + (w-pw)/2, b + (h-ph)*0.3, pw, ph);
    doc.restoreGraphicsState();
  }

  // nom dans le cartouche
  doc.setTextColor(...ENCRE); doc.setFont("times","bolditalic");
  centre(doc, T(d.nom), mm(745), mm(Z.nomY) + 3.6, 30, 168, 12);

  // « pour avoir accompli avec succès le niveau » (ou le module)
  doc.setFont("times","bold");
  const tp = tailleRef(doc, "phrase");
  if(d.precision){
    // attestation de module : deux lignes entre le cartouche du nom et la pastille
    centre(doc, T(d.phrase), mm(745), mm(Z.phrase - 22), 11.5, 178, 8);
    doc.setFont("times","bolditalic"); centre(doc, T(d.precision), mm(745), mm(Z.phrase + 4), 11.5, 178, 8);
  } else centre(doc, T(d.phrase), mm(745), mm(Z.phrase), tp, 178, 8);

  // niveau dans la pastille
  doc.setTextColor(255,255,255); doc.setFont("times","bold");
  doc.setFontSize(30);
  centre(doc, T(d.niveauNom.toUpperCase()), mm(Z.pill[0]), mm(Z.pill[1]) + 3.6, 30, 74, 12);

  // « avec la mention X et une note de N/20 »
  doc.setTextColor(...ENCRE);
  const tm = tailleRef(doc, "mention");
  const note = (Math.round(d.note*10)/10).toString().replace(".", ",");
  let phraseM = T(`avec la mention ${mention(d.note)} et ${d.noteMot||"une note"} de ${note}/20`);
  doc.setFont("times","bold"); centre(doc, phraseM, mm(745), mm(Z.mention), tm, 180, 8);

  // naissance, date, signature
  doc.setTextColor(...ENCRE);
  surTrait(doc, T(d.dateNaissance||""), Z.naissance, 17);
  surTrait(doc, T(d.lieuNaissance||""), Z.lieu, 17);
  surTrait(doc, T(d.date), Z.fait, 17);
  // signature sur le trait, puis nom et fonction du responsable dessous
  const xs = mm((Z.signature[0]+Z.signature[2])/2), ys = mm(Z.signature[1]);
  if(d.signature){
    // centrée au-dessus du trait, sans le toucher. L'ornement sous le cadre du verset a été retiré des fonds
    // pour lui laisser la place. Signature complète (pied compris), posée juste au-dessus du trait.
    const h = 13.2, w = h*600/512, top = ys - 0.8 - h;
    doc.addImage(d.signature, "PNG", xs - w/2, top, w, h);
  }
  doc.setTextColor(...ENCRE); doc.setFont("times","bold");
  centre(doc, T(d.responsable || ""), xs, ys + 4.6, 11.5, 100, 8);
  doc.setFont("times","normal"); doc.setFontSize(9.5);
  doc.text(T(d.fonction || "Le Responsable de la formation"), xs, ys + 7.8, {align:"center"});

  // code QR de vérification, à droite de la signature
  if(d.lienQR) qr(doc, d.lienQR, mm(1052), mm(830), 21);

  // numéro de vérification, sur le bandeau du bas
  doc.setTextColor(255,255,255); doc.setFont("times","bold");
  const tq = tailleRef(doc, "pied");
  const pied = T(`${d.libelleCode || "N° d'attestation"} : ${d.code} ; vérifiable en ligne`);
  doc.setFontSize(tq*0.8);
  if(doc.getTextWidth(pied) <= 120) centre(doc, pied, mm(Z.pied[0]), mm(Z.pied[1]), tq, 120, tq*0.8);
  else {
    // diplôme : plusieurs numéros, sur deux lignes
    let t = tq; doc.setFontSize(t);
    let l = doc.splitTextToSize(pied, 118);
    while(t > 5 && l.length > 2){ t -= 0.25; doc.setFontSize(t); l = doc.splitTextToSize(pied, 118); }
    doc.text(l.slice(0,2), mm(Z.pied[0]), mm(Z.pied[1]) - t*0.3528*0.95, {align:"center"});
  }
}

window.HDF_ATTESTATION = {dessiner, fondImage, mention, ZONES};
})();
