-- Vérification d'une attestation : renvoie aussi la photo d'identité du titulaire.
-- À exécuter une fois dans Supabase (SQL Editor) : copiez tout le fichier, puis « Run ».
create or replace function public.verifier_attestation(p_no text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nom', coalesce(nullif(trim(p.nom_naissance), ''), p.nom), 'module', g.module_id, 'date', g.cert_date, 'score', g.meilleur, 'origine', g.origine,
                            'photo', ph.image)  -- photo d'identité : affichée à la vérification pour reconnaître le titulaire
    from public.progression g join public.profils p on p.id = g.user_id
    left join public.photos ph on ph.user_id = g.user_id
   where g.cert_no = upper(trim(p_no));
$$;
grant execute on function public.verifier_attestation(text) to anon, authenticated;
