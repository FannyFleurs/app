# Checklist de revue fiscale

À utiliser par un expert-comptable, avocat fiscaliste ou organisme certificateur
pour évaluer la base technique Florea POS.

## Code & architecture

- [ ] `lib/fiscal/core.ts` lu en intégralité (≤ 250 lignes)
- [ ] `lib/fiscal/hash.ts` lu en intégralité (≤ 60 lignes)
- [ ] `migrations/0001_init_schema.sql` lu : triggers `fn_block_update_delete`, `fn_protect_validated_sale`, `fn_protect_validated_invoice`
- [ ] Permissions vérifiées dans `lib/auth/rbac.ts` : `pos.void_validated_sale = []`
- [ ] Multi-tenant : `organization_id` présent et filtré dans toutes les requêtes

## Tests SQL à exécuter sur une base seed

```sql
-- 1. Vérifier qu'on ne peut pas UPDATE un fiscal_event
UPDATE fiscal_events SET payload = '{}'::jsonb WHERE immutable_index = 1;
-- attendu : ERROR TABLE_APPEND_ONLY

-- 2. Vérifier qu'on ne peut pas DELETE
DELETE FROM fiscal_events WHERE immutable_index = 1;
-- attendu : ERROR TABLE_APPEND_ONLY

-- 3. Vérifier qu'on ne peut pas modifier une vente validée
UPDATE sales SET total_ttc = 0 WHERE status = 'validated' LIMIT 1;
-- attendu : ERROR SALE_IMMUTABLE

-- 4. Vérifier la continuité de la chaîne
SELECT immutable_index, previous_hash, current_hash FROM fiscal_events ORDER BY immutable_index;
-- vérifier visuellement que current_hash[n] = previous_hash[n+1]

-- 5. Vérifier qu'aucune séquence n'a de gap
SELECT receipt_sequence FROM sales WHERE status='validated' ORDER BY receipt_sequence;
-- les valeurs doivent être consécutives par année
```

## Tests applicatifs

- [ ] Tenter de supprimer une vente validée → impossible
- [ ] Tenter de double-clôturer une journée → erreur `DAILY_CLOSURE_ALREADY_SEALED`
- [ ] Vendeur tente d'override un prix → erreur 403
- [ ] Lancer `npm run fiscal:verify` → renvoie OK
- [ ] Modifier directement en BDD `fiscal_events.current_hash` puis relancer la vérification → l'altération est détectée
- [ ] Réinitialiser la base puis re-rejouer 100 ventes : la séquence reçoit T-YYYY-000001 → T-YYYY-000100 sans rupture

## Conservation

- [ ] Politique de sauvegarde Postgres documentée (PITR, base secondaire, etc.)
- [ ] Plan d'archivage à valeur probante prévu
- [ ] Durée de conservation 6 ans documentée

## Documentation

- [ ] `docs/conformite.md` lu
- [ ] `docs/architecture.md` lu
- [ ] CGU / engagements éditeur en cours de rédaction (hors code)
- [ ] Procédure de mise à jour & versionnement documentée
