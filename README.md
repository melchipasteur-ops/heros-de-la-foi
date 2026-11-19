# Héro de la Foi

Programme de formation biblique en ligne, de la conversion à la maturité.

- **4 niveaux** : Nouveau converti, Disciple, Serviteur, Leader
- **24 modules** (6 par niveau), 72 leçons avec versets, points à retenir et applications
- **Foi agissante** : chaque module demande une mise en pratique décrite par écrit
- **Examens en ligne** : 5 questions par module, corrigées automatiquement, réussite à 80 %
- **Attestations PDF** numérotées par module, et un diplôme par niveau terminé

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La plateforme (une seule page, sans serveur) |
| `programme.json` | Tout le contenu des cours et des examens |
| `contenu/n1.js` … `n4.js` | Contenu source, niveau par niveau (plus facile à modifier) |
| `contenu/build.js` | Régénère `programme.json` : `node contenu/build.js` |

## Héberger

Le site est statique : il fonctionne sur GitHub Pages (Settings → Pages → branche `main`, dossier racine).

Hors de claude.ai, la progression de chaque étudiant est gardée dans son navigateur. Le suivi partagé par l'enseignant (espace enseignant, notes sur 20) fonctionne dans la version publiée sur claude.ai, qui fournit la base de données et les comptes. Pour l'avoir aussi sur GitHub Pages, il faudra brancher une base de données (par exemple Firebase ou Supabase).
