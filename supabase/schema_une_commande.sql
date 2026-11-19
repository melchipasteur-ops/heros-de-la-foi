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
  execute $c2$create table if not exists public.cles_examen (
  module_id text not null,
  question  int  not null,
  reponse   text not null,
  primary key (module_id, question)
)$c2$;
  execute $c3$create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, nom, eglise)
  values (new.id,
          coalesce(left(trim(new.raw_user_meta_data->>'nom'), 80), ''),
          coalesce(left(trim(new.raw_user_meta_data->>'eglise'), 80), ''))
  on conflict (id) do nothing;
  return new;
end $$$c3$;
  execute $c4$drop trigger if exists on_auth_user_created on auth.users$c4$;
  execute $c5$create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.creer_profil()$c5$;
  execute $c6$create or replace function public.est_enseignant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'enseignant');
$$$c6$;
  execute $c7$alter table public.profils     enable row level security$c7$;
  execute $c8$alter table public.progression enable row level security$c8$;
  execute $c9$alter table public.cles_examen enable row level security$c9$;
  execute $c10$drop policy if exists "profil : lecture" on public.profils$c10$;
  execute $c11$create policy "profil : lecture" on public.profils for select to authenticated
  using (id = auth.uid() or public.est_enseignant())$c11$;
  execute $c12$drop policy if exists "profil : modification" on public.profils$c12$;
  execute $c13$create policy "profil : modification" on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid())$c13$;
  execute $c14$drop policy if exists "progression : lecture" on public.progression$c14$;
  execute $c15$create policy "progression : lecture" on public.progression for select to authenticated
  using (user_id = auth.uid() or public.est_enseignant())$c15$;
  execute $c16$drop policy if exists "progression : notation enseignant" on public.progression$c16$;
  execute $c17$create policy "progression : notation enseignant" on public.progression for update to authenticated
  using (public.est_enseignant()) with check (public.est_enseignant())$c17$;
  execute $c18$revoke all on public.profils, public.progression, public.cles_examen from anon, authenticated$c18$;
  execute $c19$grant select on public.profils, public.progression to authenticated$c19$;
  execute $c20$grant update (nom, eglise) on public.profils to authenticated$c20$;
  execute $c21$grant update (note, commentaire, date_eval) on public.progression to authenticated$c21$;
  execute $c22$create or replace function public.module_existe(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cles_examen where module_id = p_module);
$$$c22$;
  execute $c23$create or replace function public.marquer_lecon(p_module text, p_lecon int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) or p_lecon not between 0 and 9 then raise exception 'Module inconnu'; end if;
  insert into public.progression (user_id, module_id, lecons) values (auth.uid(), p_module, array[p_lecon])
  on conflict (user_id, module_id) do update
    set lecons = (select array_agg(distinct x order by x) from unnest(progression.lecons || p_lecon) as x),
        maj = now();
end $$$c23$;
  execute $c24$create or replace function public.enregistrer_pratique(p_module text, p_texte text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not public.module_existe(p_module) then raise exception 'Module inconnu'; end if;
  insert into public.progression (user_id, module_id, pratique) values (auth.uid(), p_module, left(trim(coalesce(p_texte, '')), 4000))
  on conflict (user_id, module_id) do update set pratique = excluded.pratique, maj = now();
end $$$c24$;
  execute $c25$create or replace function public.soumettre_examen(p_module text, p_reponses jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total int; v_ok int; v_score numeric; v_justes jsonb; v_bonnes jsonb;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select count(*),
         count(*) filter (where p_reponses->>(question::text) = reponse),
         coalesce(jsonb_agg(question) filter (where p_reponses->>(question::text) = reponse), '[]'::jsonb),
         jsonb_object_agg(question::text, reponse)
    into v_total, v_ok, v_justes, v_bonnes
    from public.cles_examen where module_id = p_module;
  if v_total = 0 then raise exception 'Module inconnu'; end if;
  v_score := round(v_ok::numeric / v_total, 4);
  insert into public.progression (user_id, module_id, tentatives, meilleur, dernier, date_examen)
  values (auth.uid(), p_module, 1, v_score, v_score, now())
  on conflict (user_id, module_id) do update
    set tentatives = progression.tentatives + 1,
        meilleur = greatest(progression.meilleur, excluded.meilleur),
        dernier = excluded.dernier, date_examen = now(), maj = now();
  return jsonb_build_object('score', v_ok, 'total', v_total, 'justes', v_justes,
                            'bonnes', case when v_score >= 0.8 then v_bonnes else null end);
end $$$c25$;
  execute $c26$create or replace function public.delivrer_attestation(p_module text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.progression; v_nom text; v_no text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from public.progression where user_id = auth.uid() and module_id = p_module;
  if not found then raise exception 'Module non commencé'; end if;
  if r.cert_no is not null then return r.cert_no; end if;
  select nom into v_nom from public.profils where id = auth.uid();
  if length(trim(coalesce(v_nom, ''))) < 3 then raise exception 'Renseignez votre nom complet'; end if;
  if r.meilleur < 0.8 then raise exception 'Examen non réussi'; end if;
  if length(trim(r.pratique)) < 80 then raise exception 'Témoignage de foi agissante manquant'; end if;
  v_no := 'HDF-' || upper(p_module) || '-' || upper(substr(md5(auth.uid()::text || p_module || clock_timestamp()::text), 1, 6));
  update public.progression set cert_no = v_no, cert_date = now(), maj = now()
   where user_id = auth.uid() and module_id = p_module;
  return v_no;
end $$$c26$;
  execute $c27$create or replace function public.verifier_attestation(p_no text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', p.nom, 'module', g.module_id, 'date', g.cert_date, 'score', g.meilleur)
    from public.progression g join public.profils p on p.id = g.user_id
   where g.cert_no = upper(trim(p_no));
$$$c27$;
  execute $c28$revoke execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.verifier_attestation(text),
  public.est_enseignant(), public.module_existe(text), public.creer_profil() from public, anon$c28$;
  execute $c29$grant execute on function public.marquer_lecon(text,int), public.enregistrer_pratique(text,text),
  public.soumettre_examen(text,jsonb), public.delivrer_attestation(text), public.est_enseignant(),
  public.module_existe(text) to authenticated$c29$;
  execute $c30$grant execute on function public.verifier_attestation(text) to anon, authenticated$c30$;
end
$principal$;
