do $hdf$ begin
alter table public.modules drop constraint if exists modules_ordre_key;
insert into public.modules (id, niveau, ordre, nb_lecons) values
('n1m1', 1, 1, 3),
('n1m7', 1, 2, 4),
('n1m8', 1, 3, 4),
('n1m2', 1, 4, 3),
('n1m3', 1, 5, 3),
('n1m4', 1, 6, 3),
('n1m5', 1, 7, 3),
('n1m6', 1, 8, 3),
('n2m1', 2, 9, 3),
('n2m2', 2, 10, 3),
('n2m3', 2, 11, 3),
('n2m4', 2, 12, 3),
('n2m5', 2, 13, 3),
('n2m6', 2, 14, 3),
('n3m1', 3, 15, 4),
('n3m2', 3, 16, 4),
('n3m3', 3, 17, 4),
('n3m4', 3, 18, 4),
('n3m5', 3, 19, 4),
('n3m6', 3, 20, 4),
('n4m1', 4, 21, 4),
('n4m2', 4, 22, 4),
('n4m3', 4, 23, 4),
('n4m4', 4, 24, 4),
('n4m5', 4, 25, 4),
('n4m6', 4, 26, 4)
on conflict (id) do update set niveau = excluded.niveau, ordre = excluded.ordre, nb_lecons = excluded.nb_lecons;
insert into public.progression (user_id, module_id, meilleur, dernier, date_examen, tentatives, cert_no, cert_date, origine)
select t.user_id, m.id, t.note20 / 20, t.note20 / 20, now(), 0,
       'HDF-' || upper(m.id) || '-' || upper(substr(md5(t.user_id::text || m.id || clock_timestamp()::text), 1, 6)), now(), 'test'
  from (select distinct on (user_id, niveau) user_id, niveau, note20 from public.tests_passage where reussi order by user_id, niveau, note20 desc) t
  join public.modules m on m.niveau = t.niveau
 where not exists (select 1 from public.progression g where g.user_id = t.user_id and g.module_id = m.id and g.cert_no is not null)
on conflict (user_id, module_id) do update
  set meilleur = greatest(progression.meilleur, excluded.meilleur),
      cert_no = coalesce(progression.cert_no, excluded.cert_no),
      cert_date = coalesce(progression.cert_date, excluded.cert_date),
      origine = case when progression.cert_no is null then 'test' else progression.origine end;
end $hdf$;
