# Héro de la Foi

Programme de formation biblique en ligne, de la conversion à la maturité.

- **4 niveaux** : Nouveau converti, Disciple, Serviteur, Leader
- **24 modules** (6 par niveau), 72 leçons avec versets, points à retenir et applications
- **Foi agissante** : chaque module demande une mise en pratique décrite par écrit
- **Cours approfondis** : lectures bibliques obligatoires, récit biblique, exégèse (mots hébreux et grecs), enseignement, applications au monde d'aujourd'hui, étude de cas (≈ 190 000 mots, citations Louis Segond 1910)
- **Examens en ligne** : 20 questions par module, notées sur 20, corrigées sur le serveur ; 16/20 ouvre le module suivant
- **Progression obligatoire** : Nouveau converti → Disciple → Serviteur → Leader
- **Test de passage** : 80 questions tirées au hasard dans un niveau ; avec 16/20, toutes les attestations du niveau sont délivrées (3 essais max par 24 h)
- **Attestations PDF** numérotées par module, un diplôme par niveau, et une page publique de vérification (`/#verifier`)
- **Comptes étudiants** et **espace enseignant** (suivi, lecture des témoignages, note sur 20 et appréciation)

Hébergement : **Vercel** (le site) + **Supabase** (comptes et base de données).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.js` | La plateforme |
| `programme.json` | Liste des niveaux et modules |
| `modules/<id>.json` | Cours complet d'un module, **sans les réponses** |
| `api/config.js` | Donne à la page l'adresse Supabase et la clé publique, lues dans les variables Vercel |
| `supabase/schema.sql` | Tables, sécurité (RLS) et fonctions : à exécuter dans Supabase |
| `supabase/cles_examen.sql` | Réponses des examens : à exécuter dans Supabase, jamais envoyées au navigateur |
| `contenu/v2/<id>.json` | Contenu source de chaque module, avec les réponses (format : `contenu/v2/FORMAT.md`, contrôle : `node contenu/v2/valider.js`) |
| `contenu/build.js` | Régénère `programme.json`, `modules/` et les fichiers SQL : `node contenu/build.js` |
| `supabase/*_une_commande.sql` | Mêmes scripts en une seule commande, pour les outils qui refusent plusieurs commandes |
| `.vercelignore` | Empêche Vercel de publier `contenu/` et `supabase/` |

## Mise en place

### 1. Supabase
1. Créez un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** : collez et exécutez `supabase/schema.sql`, puis `supabase/cles_examen.sql`.
   Si votre outil affiche « impossible d'insérer plusieurs commandes dans une instruction préparée », utilisez plutôt `supabase/schema_une_commande.sql` puis `supabase/cles_examen_une_commande.sql` (mêmes commandes, regroupées en une seule ; régénérées par `python3 contenu/une_commande.py`).
3. **Authentication → URL Configuration** : mettez l'adresse Vercel du site dans *Site URL* et dans *Redirect URLs* (pour les liens de confirmation et de mot de passe oublié).
4. **Project Settings → API** : notez la *Project URL* et la clé **anon public**. N'utilisez jamais la clé `service_role` dans le site.

### 2. Vercel
1. *Add New → Project* et importez ce dépôt GitHub (aucun réglage de build : site statique).
2. *Settings → Environment Variables* : ajoutez `SUPABASE_URL` et `SUPABASE_ANON_KEY`, puis redéployez.

### 3. Premier enseignant
Créez votre compte sur le site, puis dans le SQL Editor de Supabase :

```sql
update public.profils set role = 'enseignant'
 where id = (select id from auth.users where email = 'votre-adresse@exemple.com');
```

## Modifier le contenu
Modifiez `contenu/v2/<id>.json`, lancez `node contenu/build.js`, ré-exécutez `supabase/cles_examen.sql` dans Supabase, puis poussez sur GitHub (Vercel redéploie tout seul).

> Les réponses des examens se trouvent dans `contenu/` et `supabase/`. Gardez ce dépôt **privé** pour qu'elles ne soient pas lisibles par les étudiants.
