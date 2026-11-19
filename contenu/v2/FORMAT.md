# Format d'un module approfondi — Héro de la Foi (v2)

Chaque module est **un fichier JSON** : `/mnt/project-files/heros-de-la-foi/contenu-v2/<id>.json`
(ex. `n1m1.json`). Langue : **français**, registre clair et chaleureux, pour des étudiants
francophones (Afrique, Europe, Caraïbes…). Public : de nouveaux convertis jusqu'aux leaders.

Les 24 modules à rédiger, avec leurs identifiants, titres et objectifs, sont dans
`/mnt/project-files/heros-de-la-foi/programme.json` (version actuelle, courte). **Gardez les mêmes
`id`, `titre` et `objectif`**, ainsi que les thèmes des 3 leçons existantes ; vous pouvez ajouter une
4ᵉ leçon si le sujet l'exige. La version actuelle est trop courte : il faut la développer en profondeur.

Vérifiez chaque fichier avec : `node /mnt/project-files/heros-de-la-foi/contenu-v2/valider.js <id>.json`

## Règles de fond

- **Citations bibliques : uniquement Louis Segond 1910** (domaine public). Ne citez jamais la Segond 21,
  la Colombe, la NEG, la Semeur ou la BFC (textes protégés). Références au format `Jean 3.16`, `Romains 5.1-11`.
- Exégèse sérieuse : contexte historique et littéraire, auteur, destinataires, structure du passage,
  mots clés hébreux/grecs (translittération + sens), sens premier pour les premiers lecteurs, puis principe.
- Théologie évangélique, centrée sur Christ et sur l'Écriture. Pas de polémique contre d'autres
  confessions ; sur les points débattus entre évangéliques, présentez les positions avec respect.
- Applications **concrètes au monde d'aujourd'hui** : travail, famille, réseaux sociaux, argent,
  précarité, migrations, pression culturelle, corruption, santé mentale, technologie…
- **Récits bibliques racontés** (pas seulement cités) : narration vivante, fidèle au texte, puis leçons.
- Pas de faits inventés : pas de fausses statistiques, pas de citations d'auteurs non vérifiables.
- Les questions d'examen portent sur le contenu des leçons et sur les passages de lecture obligatoire.

## Structure JSON

```json
{
  "id": "n1m1",
  "titre": "Le salut et la nouvelle naissance",
  "objectif": "…",
  "introduction": ["paragraphe", "…"],                 // 2-4 paragraphes : enjeux du module
  "lecturesObligatoires": [                             // 6 à 12 passages à lire pendant le module
    { "ref": "Jean 3.1-21", "consigne": "Relevez ce que Jésus dit de la nouvelle naissance." }
  ],
  "lecons": [                                           // 3 ou 4 leçons
    {
      "titre": "Le problème du péché",
      "lectures": [ { "ref": "Romains 3.9-26", "resume": "1-2 phrases" } ],      // 2-4 passages
      "recit": {                                        // une histoire biblique racontée
        "titre": "David et Bath-Schéba",
        "ref": "2 Samuel 11-12",
        "paragraphes": ["…", "…", "…"],                 // 300-600 mots au total
        "lecons": ["ce que ce récit nous apprend", "…"] // 2-4 points
      },
      "exegese": [                                      // 2-4 sections, 500-900 mots au total
        { "titre": "Contexte de l'épître aux Romains", "paragraphes": ["…"] },
        { "titre": "Romains 3.23 verset par verset", "paragraphes": ["…"] }
      ],
      "motsCles": [                                     // 2-5 mots
        { "mot": "péché", "langue": "grec", "original": "hamartia", "sens": "manquer la cible…" }
      ],
      "enseignement": [                                 // explication biblique et doctrinale
        { "titre": "…", "paragraphes": ["…"] }          // 2-4 sections, 500-900 mots au total
      ],
      "citations": [                                    // versets clés cités en entier (LSG 1910)
        { "ref": "Romains 3.23", "texte": "Car tous ont péché et sont privés de la gloire de Dieu ;" }
      ],
      "application": [                                  // 3-5 situations concrètes d'aujourd'hui
        { "titre": "Au travail", "paragraphes": ["…"] } // 300-600 mots au total
      ],
      "etudeDeCas": {
        "situation": "Paragraphe décrivant une situation réaliste (prénom fictif)…",
        "questions": ["…", "…", "…"]
      },
      "reflexion": ["question personnelle", "…"],      // 3-5
      "retenir": ["point clé", "…"],                    // 3-5
      "memoriser": { "ref": "Éphésiens 2.8-9", "texte": "Car c'est par la grâce…" },
      "priere": "Courte prière en réponse à la leçon."
    }
  ],
  "pratique": {                                         // la « foi agissante » du module
    "consigne": "Ce que l'étudiant doit faire et décrire par écrit.",
    "etapes": ["…", "…", "…"]
  },
  "examen": [                                           // EXACTEMENT 20 questions
    {
      "q": "Selon Romains 6.23, quel est le salaire du péché ?",
      "choix": ["La pauvreté", "La mort", "La maladie", "L'oubli"],   // 4 choix (ou 2 pour Vrai/Faux)
      "bonne": 1,                                       // index de la bonne réponse (0 = premier)
      "explication": "1-2 phrases avec la référence biblique."
    }
  ]
}
```

## Longueur visée

Chaque leçon complète : **2 500 à 4 000 mots** (récit + exégèse + enseignement + application +
étude de cas). Un module complet : environ 8 000 à 14 000 mots. Le validateur signale les leçons trop courtes.

## Examen (20 questions)

- Mélanger : questions de connaissance biblique (qui, quoi, où), de compréhension (sens d'un texte),
  d'application (que faire dans telle situation), et sur les lectures obligatoires.
- 4 choix plausibles ; une seule bonne réponse ; au plus 4 questions Vrai/Faux.
- Répartir la bonne réponse sur les positions 0, 1, 2 et 3 (pas toujours la même).
- Ces questions servent aussi au **test de passage** du niveau (80 questions tirées des 120 du niveau) :
  chaque question doit se comprendre seule, sans « dans cette leçon » ou « ci-dessus ».
