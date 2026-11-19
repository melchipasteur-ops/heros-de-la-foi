-- Version « une seule commande » de schema.sql (générée).
-- Copiez TOUT le fichier et exécutez-le en une fois.
do $principal$
begin
  execute $c0$create table if not exists public.profils (
  id       uuid primary key references auth.users on delete cascade,
  nom      text not null default '',
  eglise   text not null default '',
  role     text not null default 'etudiant' check (role in ('etudiant','enseignant')),
  inscrit  timestamptz not null default now()
)$c0$;
  execute $c1$create table if not exists public.progression (
  user_id      uuid not null references auth.users on delete cascade,
  module_id    text not null,
  lecons       int[] not null default '{}',
  pratique     text not null default '',
  tentatives   int not null default 0,
  meilleur     numeric not null default 0,        dernier      numeric,
  date_examen  timestamptz,
  cert_no      text unique,
  cert_date    timestamptz,
  note         numeric check (note is null or (note >= 0 and note <= 20)),    commentaire  text,
  date_eval    timestamptz,
  maj          timestamptz not null default now(),
  primary key (user_id, module_id)
)$c1$;
  execute $c2$alter table public.progression add column if not exists origine text not null default 'cours'$c2$;
  execute $c3$alter table public.progression add column if not exists etapes jsonb not null default '{}'$c3$;
  execute $c4$alter table public.progression add column if not exists pratique_statut text$c4$;
  execute $c5$alter table public.progression add column if not exists pratique_avis text$c5$;
  execute $c6$alter table public.progression add column if not exists pratique_date timestamptz$c6$;
  execute $c7$alter table public.profils add column if not exists enseignant_id uuid references auth.users on delete set null$c7$;
  execute $c8$create table if not exists public.reglages (
  cle    text primary key,
  valeur jsonb not null
)$c8$;
  execute $c9$insert into public.reglages (cle, valeur) values ('validation_temoignage_obligatoire', 'false') on conflict (cle) do nothing$c9$;
  execute $c10$create table if not exists public.suivi_notes (
  id            uuid primary key default gen_random_uuid(),
  etudiant_id   uuid not null references auth.users on delete cascade,
  enseignant_id uuid not null references auth.users on delete cascade,
  texte         text not null check (length(texte) between 1 and 2000),
  visible       boolean not null default false,     cree          timestamptz not null default now()
)$c10$;
  execute $c11$create table if not exists public.modules (
  id      text primary key,
  niveau  int  not null,
  ordre   int  not null
)$c11$;
  execute $c12$alter table public.modules drop constraint if exists modules_ordre_key$c12$;
  execute $c13$alter table public.modules add column if not exists nb_lecons int not null default 0$c13$;
  execute $c14$create table if not exists public.cles_examen (
  module_id text not null,
  question  int  not null,
  reponse   text not null,
  primary key (module_id, question)
)$c14$;
  execute $c15$alter table public.cles_examen add column if not exists explication text$c15$;
  execute $c16$create table if not exists public.tests_passage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  niveau     int  not null,
  questions  jsonb not null,             debut      timestamptz not null default now(),
  fin        timestamptz,
  bonnes     int,
  total      int,
  note20     numeric,
  reussi     boolean
)$c16$;
  execute $c17$create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, nom, eglise)
  values (new.id,
          coalesce(left(trim(new.raw_user_meta_data->>'nom'), 80), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'eglise'), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$$c17$;
  execute $c18$drop trigger if exists on_auth_user_created on auth.users$c18$;
  execute $c19$create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.creer_profil()$c19$;
  execute $c20$create or replace function public.est_enseignant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'enseignant');
$$$c20$;
  execute $c21$create or replace function public.module_existe(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules where id = p_module);
$$$c21$;
  execute $c22$create or replace function public.niveau_ouvert(p_user uuid, p_niveau int) returns boolean
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
$$$c22$;
  execute $c23$create or replace function public.module_ouvert(p_user uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.ordre = 1 or exists (
      select 1 from public.modules prec
        join public.progression g on g.module_id = prec.id and g.user_id = p_user and (g.meilleur >= 0.8 or g.cert_no is not null)
       where prec.ordre = m.ordre - 1)
      from public.modules m where m.id = p_module), false);
$$$c23$;
  execute $c24$alter table public.profils       enable row level security$c24$;
  execute $c25$alter table public.progression   enable row level security$c25$;
  execute $c26$alter table public.cles_examen   enable row level security$c26$;
  execute $c27$alter table public.modules       enable row level security$c27$;
  execute $c28$alter table public.tests_passage enable row level security$c28$;
  execute $c29$drop policy if exists "profil : lecture" on public.profils$c29$;
  execute $c30$create policy "profil : lecture" on public.profils for select to authenticated
  using (id = auth.uid() or public.est_enseignant())$c30$;
  execute $c31$drop policy if exists "profil : modification" on public.profils$c31$;
  execute $c32$create policy "profil : modification" on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid())$c32$;
  execute $c33$drop policy if exists "progression : lecture" on public.progression$c33$;
  execute $c34$create policy "progression : lecture" on public.progression for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant())$c34$;
  execute $c35$drop policy if exists "progression : notation enseignant" on public.progression$c35$;
  execute $c36$create policy "progression : notation enseignant" on public.progression for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant())$c36$;
  execute $c37$drop policy if exists "modules : lecture" on public.modules$c37$;
  execute $c38$create policy "modules : lecture" on public.modules for select to anon, authenticated using (true)$c38$;
  execute $c39$drop policy if exists "tests : lecture" on public.tests_passage$c39$;
  execute $c40$create policy "tests : lecture" on public.tests_passage for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant())$c40$;
  execute $c41$alter table public.reglages    enable row level security$c41$;
  execute $c42$alter table public.suivi_notes enable row level security$c42$;
  execute $c43$drop policy if exists "reglages : lecture" on public.reglages$c43$;
  execute $c44$create policy "reglages : lecture" on public.reglages for select to authenticated using (true)$c44$;
  execute $c45$drop policy if exists "reglages : enseignant" on public.reglages$c45$;
  execute $c46$create policy "reglages : enseignant" on public.reglages for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant())$c46$;
  execute $c47$drop policy if exists "suivi : lecture" on public.suivi_notes$c47$;
  execute $c48$create policy "suivi : lecture" on public.suivi_notes for select to authenticated
  using (public.est_enseignant() or (etudiant_id = auth.uid() and visible))$c48$;
  execute $c49$drop policy if exists "suivi : ajout" on public.suivi_notes$c49$;
  execute $c50$create policy "suivi : ajout" on public.suivi_notes for insert to authenticated
  with check (public.est_enseignant() and enseignant_id = auth.uid())$c50$;
  execute $c51$drop policy if exists "suivi : suppression" on public.suivi_notes$c51$;
  execute $c52$create policy "suivi : suppression" on public.suivi_notes for delete to authenticated
  using (public.est_enseignant() and enseignant_id = auth.uid())$c52$;
  execute $c53$revoke all on public.profils, public.progression, public.cles_examen, public.modules, public.tests_passage, public.reglages, public.suivi_notes from anon, authenticated$c53$;
  execute $c54$grant select, update (valeur) on public.reglages to authenticated$c54$;
  execute $c55$grant select, insert (etudiant_id, enseignant_id, texte, visible), delete on public.suivi_notes to authenticated$c55$;
  execute $c56$grant select on public.profils, public.progression, public.tests_passage to authenticated$c56$;
  execute $c57$grant select on public.modules to anon, authenticated$c57$;
  execute $c58$grant update (nom, eglise) on public.profils to authenticated$c58$;
  execute $c59$grant update (note, commentaire, date_eval) on public.progression to authenticated$c59$;
  execute $c60$create or replace function public.marquer_lecon(p_module text, p_lecon int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) or p_lecon not between 0 and 9 then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id, lecons) values (auth.uid(), p_module, array[p_lecon])
  on conflict (user_id, module_id) do update
    set lecons = (select array_agg(distinct x order by x) from unnest(progression.lecons || p_lecon) as x),
        maj = now();
end $$$c60$;
  execute $c61$create or replace function public.enregistrer_pratique(p_module text, p_texte text) returns void
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
end $$$c61$;
  execute $c62$create or replace function public.soumettre_examen(p_module text, p_reponses jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total int; v_ok int; v_score numeric; v_justes jsonb; v_bonnes jsonb; v_expl jsonb;
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
  v_score := round(v_ok::numeric / v_total, 4);
  insert into public.progression (user_id, module_id, tentatives, meilleur, dernier, date_examen)
  values (auth.uid(), p_module, 1, v_score, v_score, now())
  on conflict (user_id, module_id) do update
    set tentatives = progression.tentatives + 1,
        meilleur = greatest(progression.meilleur, excluded.meilleur),
        dernier = excluded.dernier, date_examen = now(), maj = now();
  return jsonb_build_object('score', v_ok, 'total', v_total, 'note20', round(v_score * 20, 1), 'justes', v_justes,
                            'bonnes', case when v_score >= 0.8 then v_bonnes end,
                            'explications', case when v_score >= 0.8 then v_expl end);
end $$$c62$;
  execute $c63$create or replace function public.delivrer_attestation(p_module text) returns text
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
end $$$c63$;
  execute $c64$create or replace function public.demarrer_test(p_niveau int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_q jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from public.modules where niveau = p_niveau) then raise exception 'Niveau inconnu'; end if;
  if not public.niveau_ouvert(auth.uid(), p_niveau) then raise exception 'Niveau verrouillé : validez d''abord le niveau précédent'; end if;
  if (select count(*) from public.tests_passage where user_id = auth.uid() and niveau = p_niveau and debut > now() - interval '24 hours') >= 3 then
    raise exception 'Vous avez déjà passé 3 tests de ce niveau en 24 heures. Réessayez demain.';
  end if;
  select jsonb_agg(jsonb_build_object('m', module_id, 'q', question)) into v_q from (
    select c.module_id, c.question from public.cles_examen c join public.modules m on m.id = c.module_id
     where m.niveau = p_niveau order by random() limit 80) t;
  insert into public.tests_passage (user_id, niveau, questions) values (auth.uid(), p_niveau, v_q) returning id into v_id;
  return jsonb_build_object('id', v_id, 'questions', v_q);
end $$$c64$;
  execute $c65$create or replace function public.soumettre_test(p_test uuid, p_reponses jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.tests_passage; v_total int; v_ok int; v_note numeric; v_reussi boolean; v_nom text; m record;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into t from public.tests_passage where id = p_test and user_id = auth.uid() for update;
  if not found then raise exception 'Test introuvable'; end if;
  if t.fin is not null then raise exception 'Ce test a déjà été corrigé'; end if;
  if now() - t.debut > interval '3 hours' then raise exception 'Temps écoulé (3 heures maximum). Recommencez un test.'; end if;
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
end $$$c65$;
  execute $c66$create or replace function public.marquer_etape(p_module text, p_lecon int, p_etape int, p_total int) returns void
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
end $$$c66$;
  execute $c67$create or replace function public.evaluer_temoignage(p_etudiant uuid, p_module text, p_statut text, p_avis text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  if p_statut not in ('valide', 'a_revoir', 'en_attente') then raise exception 'Statut inconnu'; end if;
  update public.progression set pratique_statut = p_statut, pratique_avis = nullif(left(trim(coalesce(p_avis, '')), 1000), ''), maj = now()
   where user_id = p_etudiant and module_id = p_module;
  if not found then raise exception 'Module non commencé par cet étudiant'; end if;
end $$$c67$;
  execute $c68$create or replace function public.attribuer_etudiant(p_etudiant uuid, p_enseignant uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_enseignant() then raise exception 'Réservé aux enseignants'; end if;
  if p_enseignant is not null and not exists (select 1 from public.profils where id = p_enseignant and role = 'enseignant') then
    raise exception 'Cette personne n''est pas enseignant';
  end if;
  update public.profils set enseignant_id = p_enseignant where id = p_etudiant;
end $$$c68$;
  execute $c69$create or replace function public.mon_suivi() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enseignant', (select e.nom from public.profils p join public.profils e on e.id = p.enseignant_id where p.id = auth.uid()),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('texte', n.texte, 'date', n.cree, 'auteur', e.nom) order by n.cree desc)
                            from public.suivi_notes n left join public.profils e on e.id = n.enseignant_id
                           where n.etudiant_id = auth.uid() and n.visible), '[]'::jsonb));
$$$c69$;
  execute $c70$create or replace function public.verifier_attestation(p_no text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', p.nom, 'module', g.module_id, 'date', g.cert_date, 'score', g.meilleur, 'origine', g.origine)
    from public.progression g join public.profils p on p.id = g.user_id
   where g.cert_no = upper(trim(p_no));
$$$c70$;
  execute $c71$revoke execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.verifier_attestation(text),
  public.demarrer_test(int), public.soumettre_test(uuid,jsonb),
  public.est_enseignant(), public.module_existe(text), public.module_ouvert(uuid,text), public.niveau_ouvert(uuid,int),
  public.marquer_etape(text,int,int,int), public.evaluer_temoignage(uuid,text,text,text), public.attribuer_etudiant(uuid,uuid), public.mon_suivi(),
  public.creer_profil() from public, anon$c71$;
  execute $c72$grant execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.demarrer_test(int),
  public.soumettre_test(uuid,jsonb), public.est_enseignant(), public.module_existe(text),
  public.marquer_etape(text,int,int,int), public.evaluer_temoignage(uuid,text,text,text), public.attribuer_etudiant(uuid,uuid), public.mon_suivi() to authenticated$c72$;
  execute $c73$grant execute on function public.verifier_attestation(text) to anon, authenticated$c73$;
end
$principal$;
