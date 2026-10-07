-- Un import d'historique de CA (revenue_history, migration 0076) servait
-- jusqu'ici UNIQUEMENT à combler les jours SANS vente réelle (reprise d'une
-- période entièrement antérieure à l'usage de HelloPos) — les ventes réelles
-- primaient toujours, l'import n'était jamais additionné à du CA déjà saisi.
--
-- Cas nouveau (migration vers HelloPos en plusieurs étapes) : certains canaux
-- (web/OGF) sont DÉJÀ en production dans HelloPos avant le déploiement de la
-- caisse physique en boutique. Le CA d'un mois de transition importé depuis
-- l'ancien système ne couvre alors QUE les ventes non encore dans HelloPos
-- (la boutique physique) et doit s'ADDITIONNER au CA web/OGF déjà réel pour
-- ces mêmes jours, plutôt que d'être ignoré.
--
-- additive = FALSE (défaut) : comportement historique inchangé, l'import ne
--   comble que les jours sans vente réelle (voir lib/analytics/revenue-blend.ts).
-- additive = TRUE : l'import s'ADDITIONNE au CA réel du jour, qu'il y ait ou
--   non déjà des ventes. Choisi explicitement à l'import (voir
--   /settings/revenue-history), jamais par défaut, pour ne jamais changer le
--   comportement d'un import déjà en place.
ALTER TABLE revenue_history
  ADD COLUMN IF NOT EXISTS additive BOOLEAN NOT NULL DEFAULT FALSE;
