-- Migration 0031 : email facultatif pour les utilisateurs internes.
--
-- Un vendeur de caisse se connecte uniquement par code PIN : il n'a pas
-- besoin d'email. Seuls les comptes qui accèdent au back-office / suivi
-- CA (email + mot de passe) en ont besoin. On rend donc l'email
-- nullable. La contrainte UNIQUE (organization_id, email) reste : en
-- PostgreSQL, plusieurs NULL sont considérés distincts, donc plusieurs
-- utilisateurs sans email cohabitent sans conflit.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
