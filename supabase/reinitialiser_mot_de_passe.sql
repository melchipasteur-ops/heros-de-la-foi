-- Réinitialiser le mot de passe d'un étudiant (utile pour les comptes créés avec un numéro de téléphone).
-- 1) Remplacez le numéro (indicatif du pays + numéro, sans « + » ni espaces) et le nouveau mot de passe.
-- 2) Exécutez dans Supabase > SQL Editor, puis communiquez le nouveau mot de passe à l'étudiant.
-- Pour un compte créé avec un e-mail, remplacez la condition par : where email = 'adresse@gmail.com'
update auth.users
   set encrypted_password = extensions.crypt('NouveauMotDePasse123', extensions.gen_salt('bf')), updated_at = now()
 where email = '2290164013074@tel.herodelafoi.invalid';
