// Fournit à la page l'adresse du projet Supabase et sa clé publique (anon),
// lues dans les variables d'environnement Vercel. La clé anon est faite pour
// être utilisée dans le navigateur : la sécurité vient des règles RLS.
// Ne mettez JAMAIS la clé service_role ici.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    url: process.env.SUPABASE_URL || null,
    anonKey: process.env.SUPABASE_ANON_KEY || null
  });
};
