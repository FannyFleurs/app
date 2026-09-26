-- Migration de DONNÉES (pas de changement de schéma) : rattache la
-- configuration "cartes cadeaux en ligne" EXISTANTE, actuellement au niveau
-- organisation, à la boutique "Plante Verte" — confirmé explicitement :
-- cette configuration est en réalité utilisée par le site de cette
-- boutique, au sein d'une organisation qui possède plusieurs boutiques
-- (donc on ne pouvait pas le déduire automatiquement sans confirmation,
-- voir l'audit préalable à cette évolution).
--
-- Ciblée et gardée (jamais une supposition arbitraire) : ne touche QUE les
-- organisations qui ont À LA FOIS :
--   - une configuration "online_gift_cards" au niveau organisation (clé
--     exacte, pas encore rattachée à une boutique) ;
--   - une boutique nommée EXACTEMENT "Plante Verte" dans CETTE MÊME
--     organisation.
-- Toute autre organisation (y compris une qui aurait par coïncidence une
-- boutique du même nom mais aucune configuration cartes cadeaux en ligne
-- existante, ou l'inverse) n'est pas affectée.
--
-- Idempotente : une seconde exécution ne trouve plus de ligne à renommer
-- (la clé n'est plus 'online_gift_cards' exact après le premier passage) —
-- INSERT ... ON CONFLICT DO NOTHING en garde-fou supplémentaire si une
-- configuration store-scoped existait déjà (ne devrait pas arriver, mais
-- évite toute violation de la contrainte PRIMARY KEY (organization_id, key)
-- plutôt que de faire échouer toute la migration).
--
-- Ne touche à AUCUNE donnée de vente/carte cadeau déjà émise — uniquement
-- la ligne de configuration `settings` elle-même (clé et updated_at).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT s.organization_id, s.value, s.updated_by, st.id AS store_id
      FROM settings s
      JOIN stores st
        ON st.organization_id = s.organization_id
       AND st.name = 'Plante Verte'
     WHERE s.key = 'online_gift_cards'
  LOOP
    INSERT INTO settings (organization_id, key, value, updated_by, updated_at)
    VALUES (r.organization_id, 'online_gift_cards:' || r.store_id, r.value, r.updated_by, now())
    ON CONFLICT (organization_id, key) DO NOTHING;

    DELETE FROM settings
     WHERE organization_id = r.organization_id AND key = 'online_gift_cards';
  END LOOP;
END $$;
