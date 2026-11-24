-- =====================================================================
--  Héro de la Foi : schéma Supabase (version 3)
--  À exécuter dans Supabase > SQL Editor, puis exécuter cles_examen.sql.
--  Peut être relancé sans danger, y compris sur une base de la version 1.
--  Si votre outil refuse plusieurs commandes : schema_une_commande.sql.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.profils (
  id       uuid primary key references auth.users on delete cascade,
  nom      text not null default '',
  eglise   text not null default '',
  role     text not null default 'etudiant' check (role in ('etudiant','enseignant')),
  inscrit  timestamptz not null default now()
);

create table if not exists public.progression (
  user_id      uuid not null references auth.users on delete cascade,
  module_id    text not null,
  lecons       int[] not null default '{}',
  pratique     text not null default '',
  tentatives   int not null default 0,
  meilleur     numeric not null default 0,      -- meilleure note, de 0 à 1 (0,8 = 16/20)
  dernier      numeric,
  date_examen  timestamptz,
  cert_no      text unique,
  cert_date    timestamptz,
  note         numeric check (note is null or (note >= 0 and note <= 20)),  -- note de l'enseignant /20
  commentaire  text,
  date_eval    timestamptz,
  maj          timestamptz not null default now(),
  primary key (user_id, module_id)
);
alter table public.progression add column if not exists origine text not null default 'cours';  -- 'cours' ou 'test'
-- Version 3 : suivi étape par étape et validation des témoignages par l'enseignant
alter table public.progression add column if not exists etapes jsonb not null default '{}';     -- {"0": [étape atteinte, nb d'étapes], …}
alter table public.progression add column if not exists pratique_statut text;                    -- en_attente, valide, a_revoir
alter table public.progression add column if not exists pratique_avis text;                      -- remarque de l'enseignant sur le témoignage
alter table public.progression add column if not exists pratique_date timestamptz;
-- Version 4 : identité officielle de l'étudiant pour les attestations (Prière en Ligne)
alter table public.profils add column if not exists nom_naissance  text not null default '';   -- nom complet tel que sur l'acte de naissance
alter table public.profils add column if not exists date_naissance date;
alter table public.profils add column if not exists lieu_naissance text not null default '';
alter table public.profils add column if not exists sexe           text not null default '';
alter table public.profils add column if not exists nationalite    text not null default '';
alter table public.profils add column if not exists telephone      text not null default '';
alter table public.profils add column if not exists pays           text not null default '';
alter table public.profils add column if not exists ville          text not null default '';
-- Photo d'identité numérique (fond blanc), réduite par le site à 360 x 480 pixels (JPEG en base64)
create table if not exists public.photos (
  user_id uuid primary key references auth.users on delete cascade,
  image   text not null check (image like 'data:image/jpeg;base64,%' and length(image) < 400000),
  maj     timestamptz not null default now()
);
alter table public.profils add column if not exists enseignant_id uuid references auth.users on delete set null;  -- enseignant qui suit l'étudiant

-- Réglages de la formation (modifiables par les enseignants)
create table if not exists public.reglages (
  cle    text primary key,
  valeur jsonb not null
);
insert into public.reglages (cle, valeur) values ('validation_temoignage_obligatoire', 'false') on conflict (cle) do nothing;

-- Journal de suivi : notes de l'enseignant sur un étudiant, et messages visibles par l'étudiant
create table if not exists public.suivi_notes (
  id            uuid primary key default gen_random_uuid(),
  etudiant_id   uuid not null references auth.users on delete cascade,
  enseignant_id uuid not null references auth.users on delete cascade,
  texte         text not null check (length(texte) between 1 and 2000),
  visible       boolean not null default false,   -- true : message affiché à l'étudiant
  cree          timestamptz not null default now()
);

-- Ordre des modules : sert à la progression obligatoire (rempli par cles_examen.sql)
create table if not exists public.modules (
  id      text primary key,
  niveau  int  not null,
  ordre   int  not null
);
-- L'ordre peut changer quand on insère un module : il n'est plus « unique » (sinon la mise à jour échoue).
alter table public.modules drop constraint if exists modules_ordre_key;
alter table public.modules add column if not exists nb_lecons int not null default 0;

-- Réponses des examens : jamais lisibles par les étudiants
create table if not exists public.cles_examen (
  module_id text not null,
  question  int  not null,
  reponse   text not null,
  primary key (module_id, question)
);
alter table public.cles_examen add column if not exists explication text;

-- Tests de passage (80 questions tirées au hasard dans un niveau)
create table if not exists public.tests_passage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  niveau     int  not null,
  questions  jsonb not null,           -- [{"m":"n1m1","q":3}, …]
  debut      timestamptz not null default now(),
  fin        timestamptz,
  bonnes     int,
  total      int,
  note20     numeric,
  reussi     boolean
);

-- compte = false : essai effacé par un enseignant (le test reste dans l'historique mais ne bloque plus)
alter table public.tests_passage add column if not exists compte boolean not null default true;

-- Examen de module en cours : heure de début, pour le chrono de 15 minutes (contrôlé par le serveur)
create table if not exists public.examens_en_cours (
  user_id   uuid not null references auth.users on delete cascade,
  module_id text not null,
  debut     timestamptz not null default now(),
  primary key (user_id, module_id)
);

-- ---------- Création automatique du profil à l'inscription ----------
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, nom, eglise, telephone, pays)
  values (new.id,
          coalesce(left(trim(new.raw_user_meta_data->>'nom'), 80), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'eglise'), 80), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'telephone'), 40), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'pays'), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.creer_profil();

-- ---------- Règles ----------
create or replace function public.est_enseignant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'enseignant');
$$;

create or replace function public.module_existe(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules where id = p_module);
$$;

-- Un niveau est ouvert si c'est le premier, si tous les modules du niveau précédent sont validés (16/20 ou attestation),
-- si le test de passage du niveau précédent a été réussi, ou si l'étudiant a déjà validé un module de ce niveau
-- (cela protège les étudiants déjà avancés quand un nouveau module est ajouté à un niveau).
create or replace function public.niveau_ouvert(p_user uuid, p_niveau int) returns boolean
language sql stable security definer set search_path = public as $$
  select p_niveau = 1
    or not exists (
    select 1 from public.modules m
     where m.niveau = p_niveau - 1
       and not exists (select 1 from public.progression g
                        where g.user_id = p_user and g.module_id = m.id and (g.meilleur >= 0.8 or g.cert_no is not null)))
    or exists (select 1 from public.tests_passage t where t.user_id = p_user and t.niveau = p_niveau - 1 and t.reussi)
    or exists (select 1 from public.progression g join public.modules m on m.id = g.module_id
                where g.user_id = p_user and m.niveau = p_niveau and (g.meilleur >= 0.8 or g.cert_no is not null));
$$;

-- Un module est ouvert si c'est le premier, ou si le module précédent (dans l'ordre global) est validé (16/20 ou attestation)
create or replace function public.module_ouvert(p_user uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.ordre = 1 or exists (
      select 1 from public.modules prec
        join public.progression g on g.module_id = prec.id and g.user_id = p_user and (g.meilleur >= 0.8 or g.cert_no is not null)
       where prec.ordre = m.ordre - 1)
      from public.modules m where m.id = p_module), false);
$$;

-- ---------- Sécurité (Row Level Security) ----------
alter table public.profils       enable row level security;
alter table public.progression   enable row level security;
alter table public.cles_examen   enable row level security;
alter table public.modules       enable row level security;
alter table public.tests_passage enable row level security;
alter table public.examens_en_cours enable row level security;

drop policy if exists "profil : lecture" on public.profils;
create policy "profil : lecture" on public.profils for select to authenticated
  using (id = auth.uid() or public.est_enseignant());
drop policy if exists "profil : modification" on public.profils;
create policy "profil : modification" on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "progression : lecture" on public.progression;
create policy "progression : lecture" on public.progression for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant());
drop policy if exists "progression : notation enseignant" on public.progression;
create policy "progression : notation enseignant" on public.progression for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant());

drop policy if exists "modules : lecture" on public.modules;
create policy "modules : lecture" on public.modules for select to anon, authenticated using (true);

drop policy if exists "tests : lecture" on public.tests_passage;
create policy "tests : lecture" on public.tests_passage for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant());

alter table public.photos     enable row level security;
drop policy if exists "photo : lecture" on public.photos;
create policy "photo : lecture" on public.photos for select to authenticated using (user_id = auth.uid() or public.est_enseignant());
drop policy if exists "photo : ajout" on public.photos;
create policy "photo : ajout" on public.photos for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "photo : modification" on public.photos;
create policy "photo : modification" on public.photos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.reglages    enable row level security;
alter table public.suivi_notes enable row level security;
drop policy if exists "reglages : lecture" on public.reglages;
create policy "reglages : lecture" on public.reglages for select to authenticated using (true);
drop policy if exists "reglages : enseignant" on public.reglages;
create policy "reglages : enseignant" on public.reglages for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant());
drop policy if exists "suivi : lecture" on public.suivi_notes;
create policy "suivi : lecture" on public.suivi_notes for select to authenticated
  using (public.est_enseignant() or (etudiant_id = auth.uid() and visible));
drop policy if exists "suivi : ajout" on public.suivi_notes;
create policy "suivi : ajout" on public.suivi_notes for insert to authenticated
  with check (public.est_enseignant() and enseignant_id = auth.uid());
drop policy if exists "suivi : suppression" on public.suivi_notes;
create policy "suivi : suppression" on public.suivi_notes for delete to authenticated
  using (public.est_enseignant() and enseignant_id = auth.uid());

-- Droits par colonne : tout le reste passe par les fonctions ci-dessous.
revoke all on public.profils, public.progression, public.cles_examen, public.modules, public.tests_passage, public.reglages, public.suivi_notes, public.photos, public.examens_en_cours from anon, authenticated;
grant select, insert (user_id, image, maj), update (user_id, image, maj) on public.photos to authenticated;
grant select, update (valeur) on public.reglages to authenticated;
grant select, insert (etudiant_id, enseignant_id, texte, visible), delete on public.suivi_notes to authenticated;
grant select on public.profils, public.progression, public.tests_passage to authenticated;
grant select on public.modules to anon, authenticated;
grant update (nom, eglise, nom_naissance, date_naissance, lieu_naissance, sexe, nationalite, telephone, pays, ville) on public.profils to authenticated;
grant update (note, commentaire, date_eval) on public.progression to authenticated;

-- ---------- Fonctions appelées par la plateforme ----------
create or replace function public.marquer_lecon(p_module text, p_lecon int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) or p_lecon not between 0 and 9 then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id, lecons) values (auth.uid(), p_module, array[p_lecon])
  on conflict (user_id, module_id) do update
    set lecons = (select array_agg(distinct x order by x) from unnest(progression.lecons || p_lecon) as x),
        maj = now();
end $$;

create or replace function public.enregistrer_pratique(p_module text, p_texte text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id, pratique, pratique_statut, pratique_date)
  values (auth.uid(), p_module, left(trim(coalesce(p_texte, '')), 4000), 'en_attente', now())
  on conflict (user_id, module_id) do update
    set pratique = excluded.pratique,
        pratique_statut = case when progression.pratique = excluded.pratique then progression.pratique_statut else 'en_attente' end,
        pratique_date = case when progression.pratique = excluded.pratique then progression.pratique_date else now() end,
        maj = now();
end $$;

-- Corrige l'examen d'un module (20 questions). p_reponses = {"0": "texte choisi", …}
-- Les bonnes réponses et explications ne sont renvoyées que si l'examen est réussi (16/20).
-- Démarre (ou recommence depuis le début) l'examen d'un module : 15 minutes à partir de maintenant.
create or replace function public.demarrer_examen(p_module text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  if coalesce((select cardinality(g.lecons) from public.progression g where g.user_id = auth.uid() and g.module_id = p_module), 0)
     < (select nb_lecons from public.modules where id = p_module) then
    raise exception 'Terminez d''abord toutes les leçons du module et leurs lectures obligatoires';
  end if;
  insert into public.examens_en_cours (user_id, module_id, debut) values (auth.uid(), p_module, now())
  on conflict (user_id, module_id) do update set debut = now();
  return jsonb_build_object('duree', 15 * 60);
end $$;

create or replace function public.soumettre_examen(p_module text, p_reponses jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total int; v_ok int; v_score numeric; v_justes jsonb; v_bonnes jsonb; v_expl jsonb; v_debut timestamptz; v_retour boolean := false;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  -- Lectures obligatoires : toutes les leçons doivent être terminées avant l'examen
  if coalesce((select cardinality(g.lecons) from public.progression g where g.user_id = auth.uid() and g.module_id = p_module), 0)
     < (select nb_lecons from public.modules where id = p_module) then
    raise exception 'Terminez d''abord toutes les leçons du module et leurs lectures obligatoires';
  end if;
  select count(*),
         count(*) filter (where p_reponses->>(question::text) = reponse),
         coalesce(jsonb_agg(question) filter (where p_reponses->>(question::text) = reponse), '[]'::jsonb),
         jsonb_object_agg(question::text, reponse),
         jsonb_object_agg(question::text, coalesce(explication, ''))
    into v_total, v_ok, v_justes, v_bonnes, v_expl
    from public.cles_examen where module_id = p_module;
  if v_total = 0 then raise exception 'Module inconnu'; end if;
  -- Chrono : 15 minutes (plus 90 secondes de marge pour l'envoi)
  select debut into v_debut from public.examens_en_cours where user_id = auth.uid() and module_id = p_module for update;
  if v_debut is null then raise exception 'Examen non démarré : recommencez l''examen.'; end if;
  delete from public.examens_en_cours where user_id = auth.uid() and module_id = p_module;
  if now() - v_debut > interval '16 minutes 30 seconds' then raise exception 'Temps écoulé : les 15 minutes sont dépassées. Recommencez l''examen.'; end if;
  v_score := round(v_ok::numeric / v_total, 4);
  insert into public.progression (user_id, module_id, tentatives, meilleur, dernier, date_examen)
  values (auth.uid(), p_module, 1, v_score, v_score, now())
  on conflict (user_id, module_id) do update
    set tentatives = progression.tentatives + 1,
        meilleur = greatest(progression.meilleur, excluded.meilleur),
        dernier = excluded.dernier, date_examen = now(), maj = now();
  -- Copie complète en dessous de 16/20 (et module jamais réussi) : retour obligatoire au cours.
  -- Les leçons sont à refaire avant un nouvel examen, sauf si un enseignant autorise l'examen.
  if v_score < 0.8 and (select meilleur from public.progression where user_id = auth.uid() and module_id = p_module) < 0.8 then
    update public.progression set lecons = '{}', etapes = '{}', maj = now() where user_id = auth.uid() and module_id = p_module;
    v_retour := true;
  end if;
  return jsonb_build_object('score', v_ok, 'total', v_total, 'note20', round(v_score * 20, 1), 'justes', v_justes, 'retour_cours', v_retour,
                            'bonnes', case when v_score >= 0.8 then v_bonnes end,
                            'explications', case when v_score >= 0.8 then v_expl end);
end $$;

create or replace function public.delivrer_attestation(p_module text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.progression; v_nom text; v_no text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from public.progression where user_id = auth.uid() and module_id = p_module;
  if not found then raise exception 'Module non commencé'; end if;
  if r.cert_no is not null then return r.cert_no; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  select nom into v_nom from public.profils where id = auth.uid();
  if length(trim(coalesce(v_nom, ''))) < 3 then raise exception 'Renseignez votre nom complet'; end if;
  if not exists (select 1 from public.profils where id = auth.uid() and length(trim(nom_naissance)) >= 3 and date_naissance is not null)
     or not exists (select 1 from public.photos where user_id = auth.uid()) then
    raise exception 'Complétez votre fiche d''identité (nom de l''acte de naissance, date de naissance et photo) avant l''attestation';
  end if;
  if r.meilleur < 0.8 then raise exception 'Examen non réussi : il faut au moins 16/20'; end if;
  if length(trim(r.pratique)) < 80 then raise exception 'Témoignage de foi agissante manquant'; end if;
  if r.pratique_statut = 'a_revoir' then raise exception 'Votre enseignant vous demande de revoir votre témoignage avant l''attestation'; end if;
  if coalesce((select valeur = 'true'::jsonb from public.reglages where cle = 'validation_temoignage_obligatoire'), false)
     and coalesce(r.pratique_statut, '') <> 'valide' then
    raise exception 'Votre témoignage attend la validation de votre enseignant';
  end if;
  v_no := 'HDF-' || upper(p_module) || '-' || upper(substr(md5(auth.uid()::text || p_module || clock_timestamp()::text), 1, 6));
  update public.progression set cert_no = v_no, cert_date = now(), origine = 'cours', maj = now()
   where user_id = auth.uid() and module_id = p_module;
  return v_no;
end $$;

-- Démarre un test de passage : 80 questions tirées au hasard parmi celles du niveau.
-- Au plus 3 tests par niveau et par 24 heures.
create or replace function public.demarrer_test(p_niveau int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_q jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from public.modules where niveau = p_niveau) then raise exception 'Niveau inconnu'; end if;
  if not public.niveau_ouvert(auth.uid(), p_niveau) then raise exception 'Niveau verrouillé : validez d''abord le niveau précédent'; end if;
  -- Test échoué : l'étudiant doit suivre les cours du niveau, sauf si un enseignant autorise un nouveau test
  if exists (select 1 from public.tests_passage where user_id = auth.uid() and niveau = p_niveau and compte and fin is not null and not reussi) then
    raise exception 'Test de passage non réussi : suivez les cours du niveau. Votre enseignant peut vous autoriser un nouveau test.';
  end if;
  -- Test commencé puis interrompu (page rechargée, réseau…) : on le reprend depuis le début, sans compter un essai de plus
  select id, questions into v_id, v_q from public.tests_passage
   where user_id = auth.uid() and niveau = p_niveau and compte and fin is null and debut > now() - interval '26 minutes 30 seconds'
   order by debut desc limit 1;
  if v_id is not null then
    update public.tests_passage set debut = now() where id = v_id;
    return jsonb_build_object('id', v_id, 'questions', v_q, 'duree', 25 * 60);
  end if;
  -- Seuls les tests terminés et corrigés comptent comme essais
  if (select count(*) from public.tests_passage where user_id = auth.uid() and niveau = p_niveau and compte and fin is not null and debut > now() - interval '24 hours') >= 3 then
    raise exception 'Vous avez déjà passé 3 tests de ce niveau en 24 heures. Réessayez demain, ou demandez à votre enseignant de réinitialiser vos essais.';
  end if;
  select jsonb_agg(jsonb_build_object('m', module_id, 'q', question)) into v_q from (
    select c.module_id, c.question from public.cles_examen c join public.modules m on m.id = c.module_id
     where m.niveau = p_niveau order by random() limit 80) t;
  insert into public.tests_passage (user_id, niveau, questions) values (auth.uid(), p_niveau, v_q) returning id into v_id;
  return jsonb_build_object('id', v_id, 'questions', v_q, 'duree', 25 * 60);
end $$;

-- L'étudiant a quitté l'écran (appel, autre application) : le test recommence depuis le début,
-- avec les mêmes questions et un nouveau chrono de 25 minutes (sans compter un essai de plus).
create or replace function public.recommencer_test(p_test uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.tests_passage set debut = now() where id = p_test and user_id = auth.uid() and fin is null;
  if not found then raise exception 'Test introuvable'; end if;
  return jsonb_build_object('duree', 25 * 60);
end $$;

-- Corrige un test de passage. p_reponses = {"n1m1:3": "texte choisi", …}
-- Avec au moins 16/20, toutes les attestations du niveau sont délivrées.
create or replace function public.soumettre_test(p_test uuid, p_reponses jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tests_passage; v_total int; v_ok int; v_note numeric; v_reussi boolean; v_nom text; m record;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into t from public.tests_passage where id = p_test and user_id = auth.uid() for update;
  if not found then raise exception 'Test introuvable'; end if;
  if t.fin is not null then raise exception 'Ce test a déjà été corrigé'; end if;
  -- Chrono : 25 minutes (plus 90 secondes de marge pour l'envoi)
  if now() - t.debut > interval '26 minutes 30 seconds' then raise exception 'Temps écoulé : les 25 minutes sont dépassées. Recommencez un test.'; end if;
  select count(*), count(*) filter (where p_reponses->>(c.module_id || ':' || c.question) = c.reponse)
    into v_total, v_ok
    from jsonb_array_elements(t.questions) x
    join public.cles_examen c on c.module_id = x->>'m' and c.question = (x->>'q')::int;
  v_note := round(v_ok::numeric * 20 / greatest(v_total, 1), 1);
  v_reussi := v_note >= 16;
  update public.tests_passage set fin = now(), bonnes = v_ok, total = v_total, note20 = v_note, reussi = v_reussi where id = p_test;
  if v_reussi then
    select nom into v_nom from public.profils where id = auth.uid();
    for m in select id from public.modules where niveau = t.niveau order by ordre loop
      insert into public.progression (user_id, module_id, meilleur, dernier, date_examen, tentatives, cert_no, cert_date, origine)
      values (auth.uid(), m.id, v_note / 20, v_note / 20, now(), 0,
              'HDF-' || upper(m.id) || '-' || upper(substr(md5(auth.uid()::text || m.id || clock_timestamp()::text), 1, 6)),
              now(), 'test')
      on conflict (user_id, module_id) do update
        set meilleur = greatest(progression.meilleur, excluded.meilleur),
            cert_no = coalesce(progression.cert_no, excluded.cert_no),
            cert_date = coalesce(progression.cert_date, excluded.cert_date),
            origine = case when progression.cert_no is null then 'test' else progression.origine end,
            maj = now();
    end loop;
  end if;
  return jsonb_build_object('bonnes', v_ok, 'total', v_total, 'note20', v_note, 'reussi', v_reussi);
end $$;

-- Avancement dans les étapes d'une leçon (suivi par l'enseignant). On garde l'étape la plus avancée.
create or replace function public.marquer_etape(p_module text, p_lecon int, p_etape int, p_total int) returns void
language plpgsql security definer set search_path = public as $$
declare v_avant int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) or p_lecon not between 0 and 9 or p_total not between 1 and 60 or p_etape not between 1 and p_total then raise exception 'Étape inconnue'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id) values (auth.uid(), p_module) on conflict (user_id, module_id) do nothing;
  select coalesce((etapes->(p_lecon::text)->>0)::int, 0) into v_avant from public.progression where user_id = auth.uid() and module_id = p_module;
  update public.progression
     set etapes = jsonb_set(etapes, array[p_lecon::text], jsonb_build_array(greatest(v_avant, p_etape), p_total)), maj = now()
   where user_id = auth.uid() and module_id = p_module;
end $$;

-- L'enseignant lit le témoignage : 'valide' ou 'a_revoir' (avec une remarque pour l'étudiant)
create or replace function public.evaluer_temoignage(p_etudiant uuid, p_module text, p_statut text, p_avis text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  if p_statut not in ('valide', 'a_revoir', 'en_attente') then raise exception 'Statut inconnu'; end if;
  update public.progression set pratique_statut = p_statut, pratique_avis = nullif(left(trim(coalesce(p_avis, '')), 1000), ''), maj = now()
   where user_id = p_etudiant and module_id = p_module;
  if not found then raise exception 'Module non commencé par cet étudiant'; end if;
end $$;

-- Confier un étudiant à un enseignant (ou le libérer avec null)
create or replace function public.attribuer_etudiant(p_etudiant uuid, p_enseignant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  if p_enseignant is not null and not exists (select 1 from public.profils where id = p_enseignant and role = 'enseignant') then
    raise exception 'Cette personne n''est pas enseignant';
  end if;
  update public.profils set enseignant_id = p_enseignant where id = p_etudiant;
end $$;

-- Ce que l'étudiant voit de son suivi : le nom de son enseignant et ses messages
create or replace function public.mon_suivi() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enseignant', (select e.nom from public.profils p join public.profils e on e.id = p.enseignant_id where p.id = auth.uid()),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('texte', n.texte, 'date', n.cree, 'auteur', e.nom) order by n.cree desc)
                            from public.suivi_notes n left join public.profils e on e.id = n.enseignant_id
                           where n.etudiant_id = auth.uid() and n.visible), '[]'::jsonb));
$$;

-- Rattrapage : un étudiant qui a réussi le test de passage d'un niveau reçoit les attestations de TOUS les modules
-- de ce niveau, y compris ceux ajoutés après son test (ou absents de la base au moment du test).
create or replace function public.rattraper_attestations() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into public.progression (user_id, module_id, meilleur, dernier, date_examen, tentatives, cert_no, cert_date, origine)
  select t.user_id, m.id, t.note20 / 20, t.note20 / 20, now(), 0,
         'HDF-' || upper(m.id) || '-' || upper(substr(md5(t.user_id::text || m.id || clock_timestamp()::text), 1, 6)), now(), 'test'
    from (select distinct on (niveau) user_id, niveau, note20 from public.tests_passage
           where user_id = auth.uid() and reussi order by niveau, note20 desc) t
    join public.modules m on m.niveau = t.niveau
   where not exists (select 1 from public.progression g where g.user_id = t.user_id and g.module_id = m.id and g.cert_no is not null)
  on conflict (user_id, module_id) do update
    set meilleur = greatest(progression.meilleur, excluded.meilleur),
        cert_no = coalesce(progression.cert_no, excluded.cert_no),
        cert_date = coalesce(progression.cert_date, excluded.cert_date),
        origine = case when progression.cert_no is null then 'test' else progression.origine end,
        maj = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Vérification publique d'une attestation par son numéro
create or replace function public.verifier_attestation(p_no text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', coalesce(nullif(trim(p.nom_naissance), ''), p.nom), 'module', g.module_id, 'date', g.cert_date, 'score', g.meilleur, 'origine', g.origine,
                            'photo', ph.image)  -- photo d'identité : affichée à la vérification pour reconnaître le titulaire
    from public.progression g join public.profils p on p.id = g.user_id
    left join public.photos ph on ph.user_id = g.user_id
   where g.cert_no = upper(trim(p_no));
$$;

-- Enseignant : efface les essais de test de passage d'un étudiant pour un niveau (nouveau test autorisé tout de suite)
create or replace function public.autoriser_test(p_etudiant uuid, p_niveau int) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  update public.tests_passage set compte = false where user_id = p_etudiant and niveau = p_niveau and compte and not coalesce(reussi, false);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Enseignant : autorise l'examen d'un module sans refaire les leçons (après un échec)
create or replace function public.autoriser_examen(p_etudiant uuid, p_module text) returns void
language plpgsql security definer set search_path = public as $$
declare v_nb int;
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  select nb_lecons into v_nb from public.modules where id = p_module;
  if v_nb is null then raise exception 'Module inconnu'; end if;
  insert into public.progression (user_id, module_id, lecons) values (p_etudiant, p_module, array(select generate_series(0, v_nb - 1)))
  on conflict (user_id, module_id) do update set lecons = excluded.lecons, maj = now();
end $$;

revoke execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.verifier_attestation(text),
  public.demarrer_test(int), public.soumettre_test(uuid,jsonb), public.demarrer_examen(text), public.recommencer_test(uuid), public.autoriser_test(uuid,int), public.autoriser_examen(uuid,text),
  public.est_enseignant(), public.module_existe(text), public.module_ouvert(uuid,text), public.niveau_ouvert(uuid,int),
  public.marquer_etape(text,int,int,int), public.evaluer_temoignage(uuid,text,text,text), public.attribuer_etudiant(uuid,uuid), public.mon_suivi(), public.rattraper_attestations(),
  public.creer_profil() from public, anon;
grant execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.demarrer_test(int),
  public.soumettre_test(uuid,jsonb), public.demarrer_examen(text), public.recommencer_test(uuid), public.autoriser_test(uuid,int), public.autoriser_examen(uuid,text), public.est_enseignant(), public.module_existe(text),
  public.marquer_etape(text,int,int,int), public.evaluer_temoignage(uuid,text,text,text), public.attribuer_etudiant(uuid,uuid), public.mon_suivi(), public.rattraper_attestations() to authenticated;
grant execute on function public.verifier_attestation(text) to anon, authenticated;

-- ---------- Nommer un enseignant (après sa première inscription) ----------
-- update public.profils set role = 'enseignant'
--  where id = (select id from auth.users where email = 'adresse@exemple.com');
