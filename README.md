# Héro de la Foi

Programme de formation biblique en ligne, de la conversion à la maturité.

- **4 niveaux** : Nouveau converti, Disciple, Serviteur, Leader
- **26 modules** (8 au niveau 1, 6 aux autres), dont « Alliances familiales et liberté en Christ » et « Reconnaître le péché avec équilibre » pour les nouveaux convertis
- **Leçons en petites étapes** (lectures, récit, exégèse, enseignement, application, étude de cas, jeux, à retenir), avec reprise automatique là où l'étudiant s'est arrêté ; la leçon entière reste disponible sur une page
- **Illustrations** (`images/`, 20 dessins SVG) et **jeux** dans chaque leçon : verset à compléter, associer les mots, vrai ou faux, classer les situations
- **Foi agissante** : chaque module demande une mise en pratique décrite par écrit
- **Cours approfondis** : lectures bibliques obligatoires, récit biblique, exégèse (mots hébreux et grecs), enseignement, applications au monde d'aujourd'hui, étude de cas (≈ 190 000 mots, citations Louis Segond 1910)
- **Examens en ligne** : 20 questions par module, notées sur 20, corrigées sur le serveur ; 16/20 ouvre le module suivant
- **Progression obligatoire** : Nouveau converti → Disciple → Serviteur → Leader
- **Test de passage** : 80 questions tirées au hasard dans un niveau ; avec 16/20, toutes les attestations du niveau sont délivrées (3 essais max par 24 h)
- **Attestations PDF** au nom de **PRIÈRE EN LIGNE** (logo, photo d'identité et identité de l'étudiant, signature du Min. HOUNGBADJI E. Melchisédèk, responsable de la formation), numérotées par module, un diplôme par niveau, et une page publique de vérification (`/#verifier`)
- **Fiche d'identité obligatoire** avant toute attestation : nom complet de l'acte de naissance, date et lieu de naissance, sexe, nationalité, téléphone, pays, ville, photo d'identité sur fond blanc (recadrée automatiquement)
- **Comptes étudiants** et **espace enseignant séparé** (`/enseignant.html`) : tableau de bord des responsabilités (témoignages à lire, étudiants en difficulté, inactifs, sans enseignant), enseignant attitré par étudiant, suivi leçon par leçon et étape par étape, validation ou demande de reprise des témoignages, journal de suivi et messages à l'étudiant, note sur 20 et appréciation

- **Application installable** (PWA) sur Android, iPhone et ordinateur, directement depuis le site : bouton « Installer l'application » (instructions affichées sur iPhone) ; l'espace enseignant s'installe comme une application à part

Hébergement : **Vercel** (le site) + **Supabase** (comptes et base de données).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.js` | Le site des étudiants |
| `enseignant.html`, `enseignant.js` | L'espace enseignant (page séparée) |
| `commun.js`, `styles.css` | Code et styles partagés par les deux pages |
| `manifest.webmanifest`, `manifest-enseignant.webmanifest`, `sw.js`, `icones/`, `vercel.json` | Application installable : description, icônes, service worker (pages et cours gardés en copie locale ; comptes et examens toujours en ligne) |
| `marque/` | Logo Prière en Ligne et signature du responsable, utilisés sur les attestations |
| `images/` | Illustrations (régénérées par `python3 contenu/images.py`) |
| `contenu/ordre.json` | Ordre des modules dans chaque niveau |
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
   Si votre outil refuse plusieurs commandes ou les requêtes de plus de 100 000 caractères, exécutez plutôt `supabase/schema_une_commande.sql`, puis chaque fichier de `supabase/parties/` dans l'ordre (une commande de moins de 60 000 caractères chacun, relançable sans risque).
3. **Authentication → URL Configuration** : mettez l'adresse Vercel du site dans *Site URL* et dans *Redirect URLs* (pour les liens de confirmation et de mot de passe oublié).
4. **Project Settings → API** : notez la *Project URL* et la clé **anon public**. N'utilisez jamais la clé `service_role` dans le site.

### 2. Vercel
1. *Add New → Project* et importez ce dépôt GitHub (aucun réglage de build : site statique).
2. *Settings → Environment Variables* : ajoutez `SUPABASE_URL` et `SUPABASE_ANON_KEY`, puis redéployez.

### 3. Premier enseignant
Créez votre compte sur le site des étudiants, puis dans le SQL Editor de Supabase (ensuite, connectez-vous sur `/enseignant.html`) :

```sql
update public.profils set role = 'enseignant'
 where id = (select id from auth.users where email = 'votre-adresse@exemple.com');
```

## Mettre à jour une base existante
Exécutez à nouveau `supabase/schema_une_commande.sql`, puis les fichiers de `supabase/parties/` dans l'ordre. Rien n'est effacé : les comptes, la progression et les attestations sont conservés.

## Modifier le contenu
Modifiez `contenu/v2/<id>.json`, lancez `node contenu/build.js`, ré-exécutez `supabase/cles_examen.sql` dans Supabase, puis poussez sur GitHub (Vercel redéploie tout seul).

> Les réponses des examens se trouvent dans `contenu/` et `supabase/`. Gardez ce dépôt **privé** pour qu'elles ne soient pas lisibles par les étudiants.
