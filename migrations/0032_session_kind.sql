-- Migration 0032 : type de session (poste caisse vs gestion).
--
-- La limite multi-appareils (organizations.max_devices) ne doit
-- concerner que les POSTES DE CAISSE. Les accès de gestion (back-office
-- bo., suivi CA ca., console admin) ne consomment pas de "poste" et ne
-- doivent jamais être bloqués par cette limite. On tague donc chaque
-- session : 'pos' (défaut) ou 'management'.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'pos';
