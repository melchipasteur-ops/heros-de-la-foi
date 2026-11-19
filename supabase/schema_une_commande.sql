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
  execute $c3$create table if not exists public.modules (
  id      text primary key,
  niveau  int  not null,
  ordre   int  not null unique
)$c3$;
  execute $c4$alter table public.modules add column if not exists nb_lecons int not null default 0$c4$;
  execute $c5$create table if not exists public.cles_examen (
  module_id text not null,
  question  int  not null,
  reponse   text not null,
  primary key (module_id, question)
)$c5$;
  execute $c6$alter table public.cles_examen add column if not exists explication text$c6$;
  execute $c7$create table if not exists public.tests_passage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  niveau     int  not null,
  questions  jsonb not null,             debut      timestamptz not null default now(),
  fin        timestamptz,
  bonnes     int,
  total      int,
  note20     numeric,
  reussi     boolean
)$c7$;
  execute $c8$create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, nom, eglise)
  values (new.id,
          coalesce(left(trim(new.raw_user_meta_data->>'nom'), 80), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'eglise'), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$$c8$;
  execute $c9$drop trigger if exists on_auth_user_created on auth.users$c9$;
  execute $c10$create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.creer_profil()$c10$;
  execute $c11$create or replace function public.est_enseignant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'enseignant');
$$$c11$;
  execute $c12$create or replace function public.module_existe(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modules where id = p_module);
$$$c12$;
  execute $c13$create or replace function public.niveau_ouvert(p_user uuid, p_niveau int) returns boolean
language sql stable security definer set search_path = public as $$
  select p_niveau = 1 or not exists (
    select 1 from public.modules m
     where m.niveau = p_niveau - 1
       and not exists (select 1 from public.progression g
                        where g.user_id = p_user and g.module_id = m.id and (g.meilleur >= 0.8 or g.cert_no is not null)));
$$$c13$;
  execute $c14$create or replace function public.module_ouvert(p_user uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.ordre = 1 or exists (
      select 1 from public.modules prec
        join public.progression g on g.module_id = prec.id and g.user_id = p_user and (g.meilleur >= 0.8 or g.cert_no is not null)
       where prec.ordre = m.ordre - 1)
      from public.modules m where m.id = p_module), false);
$$$c14$;
  execute $c15$alter table public.profils       enable row level security$c15$;
  execute $c16$alter table public.progression   enable row level security$c16$;
  execute $c17$alter table public.cles_examen   enable row level security$c17$;
  execute $c18$alter table public.modules       enable row level security$c18$;
  execute $c19$alter table public.tests_passage enable row level security$c19$;
  execute $c20$drop policy if exists "profil : lecture" on public.profils$c20$;
  execute $c21$create policy "profil : lecture" on public.profils for select to authenticated
  using (id = auth.uid() or public.est_enseignant())$c21$;
  execute $c22$drop policy if exists "profil : modification" on public.profils$c22$;
  execute $c23$create policy "profil : modification" on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid())$c23$;
  execute $c24$drop policy if exists "progression : lecture" on public.progression$c24$;
  execute $c25$create policy "progression : lecture" on public.progression for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant())$c25$;
  execute $c26$drop policy if exists "progression : notation enseignant" on public.progression$c26$;
  execute $c27$create policy "progression : notation enseignant" on public.progression for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant())$c27$;
  execute $c28$drop policy if exists "modules : lecture" on public.modules$c28$;
  execute $c29$create policy "modules : lecture" on public.modules for select to anon, authenticated using (true)$c29$;
  execute $c30$drop policy if exists "tests : lecture" on public.tests_passage$c30$;
  execute $c31$create policy "tests : lecture" on public.tests_passage for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant())$c31$;
  execute $c32$revoke all on public.profils, public.progression, public.cles_examen, public.modules, public.tests_passage from anon, authenticated$c32$;
  execute $c33$grant select on public.profils, public.progression, public.tests_passage to authenticated$c33$;
  execute $c34$grant select on public.modules to anon, authenticated$c34$;
  execute $c35$grant update (nom, eglise) on public.profils to authenticated$c35$;
  execute $c36$grant update (note, commentaire, date_eval) on public.progression to authenticated$c36$;
  execute $c37$create or replace function public.marquer_lecon(p_module text, p_lecon int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) or p_lecon not between 0 and 9 then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id, lecons) values (auth.uid(), p_module, array[p_lecon])
  on conflict (user_id, module_id) do update
    set lecons = (select array_agg(distinct x order by x) from unnest(progression.lecons || p_lecon) as x),
        maj = now();
end $$$c37$;
  execute $c38$create or replace function public.enregistrer_pratique(p_module text, p_texte text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) then raise exception 'Module inconnu'; end if;
  if not public.module_ouvert(auth.uid(), p_module) then raise exception 'Module verrouillé : terminez d''abord le module précédent'; end if;
  insert into public.progression (user_id, module_id, pratique) values (auth.uid(), p_module, left(trim(coalesce(p_texte, '')), 4000))
  on conflict (user_id, module_id) do update set pratique = excluded.pratique, maj = now();
end $$$c38$;
  execute $c39$create or replace function public.soumettre_examen(p_module text, p_reponses jsonb) returns jsonb
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
end $$$c39$;
  execute $c40$create or replace function public.delivrer_attestation(p_module text) returns text
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
  v_no := 'HDF-' || upper(p_module) || '-' || upper(substr(md5(auth.uid()::text || p_module || clock_timestamp()::text), 1, 6));
  update public.progression set cert_no = v_no, cert_date = now(), origine = 'cours', maj = now()
   where user_id = auth.uid() and module_id = p_module;
  return v_no;
end $$$c40$;
  execute $c41$create or replace function public.demarrer_test(p_niveau int) returns jsonb
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
end $$$c41$;
  execute $c42$create or replace function public.soumettre_test(p_test uuid, p_reponses jsonb) returns jsonb
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
end $$$c42$;
  execute $c43$create or replace function public.verifier_attestation(p_no text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', p.nom, 'module', g.module_id, 'date', g.cert_date, 'score', g.meilleur, 'origine', g.origine)
    from public.progression g join public.profils p on p.id = g.user_id
   where g.cert_no = upper(trim(p_no));
$$$c43$;
  execute $c44$revoke execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.verifier_attestation(text),
  public.demarrer_test(int), public.soumettre_test(uuid,jsonb),
  public.est_enseignant(), public.module_existe(text), public.module_ouvert(uuid,text), public.niveau_ouvert(uuid,int),
  public.creer_profil() from public, anon$c44$;
  execute $c45$grant execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.demarrer_test(int),
  public.soumettre_test(uuid,jsonb), public.est_enseignant(), public.module_existe(text) to authenticated$c45$;
  execute $c46$grant execute on function public.verifier_attestation(text) to anon, authenticated$c46$;
end
$principal$;
