-- Reprise manuelle, ciblée et vérifiée une à une (avec l'utilisateur,
-- 2026-10-08), des soldes de l'ancien système pour les clients de
-- l'organisation Fanny Fleurs restés en suspens après l'import massif de
-- 1430 clients (migration de contexte : voir aussi 0088/0089, le même
-- client OGF Services Financiers).
--
-- Deux bugs distincts ont motivé cette reprise MANUELLE plutôt qu'une
-- simple colonne « Solde dû » dans le fichier d'import :
--
--   1. Neuf institutions distinctes (7 mairies, le conseil départemental de
--      l'Orne, la mairie de Mortagne-au-Perche) partageaient dans l'ancien
--      système une même adresse email "par défaut" (celle de l'administratrice
--      HelloPos, utilisée comme simple valeur de repli). Le rapprochement par
--      email de l'import clients les a donc fusionnées en UNE SEULE fiche
--      (celle de Mortagne, traitée en dernier dans le fichier) au lieu de 9
--      fiches distinctes — pareil pour 2 contacts (bureau d'un sénateur)
--      partageant une autre adresse "générique". Ce correctif recrée les
--      fiches disparues et retire l'email erroné des fiches survivantes.
--
--   2. Un précédent import (avant celui-ci) avait déjà appliqué CERTAINS
--      soldes de l'ancien système — mais pour 2 clients, un crédit (le
--      client a de l'argent chez nous) avait été importé À L'ENVERS comme
--      une dette. Ce correctif les remet à 0 avant de leur créer le bon
--      d'achat correspondant.
--
-- Idempotente dans son ensemble : les UPDATE ciblés par nom exact n'ont
-- d'effet qu'une fois (déjà appliqué sinon, cf. valeurs déjà en place), les
-- INSERT de fiches sont nommés et uniques, les bons d'achat sont exclusifs
-- à cette migration (codes EAN-13 générés une fois, non réutilisables).
-- ============================================================
-- Reprise manuelle, ciblée et vérifiée une à une, des 16 soldes dus
-- et 27 crédits de l'ancien système, pour l'organisation Fanny Fleurs.
-- Contexte complet : voir la conversation avec l'utilisateur du
-- 2026-10-08 (import massif de 1430 clients, puis reprise manuelle
-- de leurs soldes, un par un, pour ne jamais créer de doublon).
-- ============================================================

-- ============================================================
-- SECTION 1 : retire l'email "par défaut" erroné des fiches qui
-- l'ont hérité par rapprochement lors de l'import (1430 clients) --
-- alors qu'il ne leur appartient pas réellement (adresse email
-- interne utilisée comme simple valeur par défaut dans l'ancien
-- système, partagée à tort par plusieurs institutions distinctes).
-- ============================================================
UPDATE customers SET email = NULL, updated_at = now()
 WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb'
   AND email = 'adm.fannyfleurs@gmail.com'
   AND company_name = 'Mairie de Mortagne au Perche';
UPDATE customers SET email = NULL, updated_at = now()
 WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb'
   AND email = 'o.bitz@senat.fr'
   AND first_name = 'de l''Orne Olivier BITZ' AND last_name = 'Sénateur';

-- ============================================================
-- SECTION 2 : recrée les fiches "avalées" par cette fusion erronée
-- (9 institutions/personnes distinctes partageaient la même adresse
-- email "par défaut", une seule fiche a survécu par groupe).
-- Email volontairement laissé vide (pas de vraie adresse connue).
-- ============================================================
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie de Nogent-le-Rotrou', '02 37 29 68 83', NULL, '{}'::jsonb, '2528' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie de Saint Martin des Pezerits', NULL, NULL, '{}'::jsonb, '2655' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie Alençon', NULL, NULL, '{"zip":"61000","city":"Alencon"}'::jsonb, '638' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie de Sablons sur Huisne', '0233733401', NULL, '{"zip":"61110","city":"Sablons sur Huisne"}'::jsonb, '2803' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie de Coulonges sur sarthe', '0689720641', '21610126100016', '{"zip":"61170","city":"coulonges sur sarthe"}'::jsonb, '5897' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie de st Hilaire le Chatel', '02 33 25 01 13', NULL, '{"line1":"13 place de la mairie","zip":"61400","city":"St Hilaire le chatel"}'::jsonb, '1433' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'professionnel', NULL, NULL, 'Mairie L''home Chamondot', NULL, NULL, '{"zip":"61290","city":"L''home chamondot"}'::jsonb, '2837' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');
INSERT INTO customers (organization_id, type, first_name, last_name, company_name, phone, siret, address, loyalty_code)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'particulier', 'Ouary Agathe', 'Petit', NULL, '0682137017', NULL, '{}'::jsonb, '+5646' WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');

-- conseil départemental de l'Orne : fiche recréée AVEC sa dette
-- (241,50€), jamais appliquée jusqu'ici puisque sa fiche n'existait
-- pas distinctement (fusionnée à tort avec Mairie de Mortagne).
INSERT INTO customers (organization_id, type, first_name, last_name, phone, address, loyalty_code, account_balance)
SELECT '7d74c3bb-25b5-41f7-92cc-50d3714a0afb', 'particulier', 'départemental de l''Orne', 'conseil', '0233816174', '{"line1":"Hotel du département","zip":"61017","city":"ALENCON cedex"}'::jsonb, '699871', -241.50 WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb');

-- ============================================================
-- SECTION 3 : applique les 9 dettes restantes (vraies dettes de
-- l'ancien système, confirmées, jamais appliquées jusqu'ici) sur
-- des fiches déjà existantes (créées par l'import des 1430, sans
-- conflit d'email). Correspondance par nom/société EXACT, limitée
-- à une seule fiche (pas d'effet si 0 ou plusieurs correspondances)
-- pour ne jamais appliquer une dette à la mauvaise fiche.
-- ============================================================
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 256.35, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Guy' AND last_name = 'Stéphane')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Guy' AND last_name = 'Stéphane') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 180.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'de Mortagne au Perche' AND last_name = 'CCM')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'de Mortagne au Perche' AND last_name = 'CCM') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 140.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'de l''Orne Jourdan Chantal' AND last_name = 'Député')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'de l''Orne Jourdan Chantal' AND last_name = 'Député') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 130.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'départemental du finistère' AND last_name = 'conseil')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'départemental du finistère' AND last_name = 'conseil') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 117.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = '3ifa')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = '3ifa') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 80.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'christophe' AND last_name = 'mezerette')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'christophe' AND last_name = 'mezerette') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 30.0, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = 'Olezac')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = 'Olezac') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 23.36, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Eloïse' AND last_name = 'Rivière')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Eloïse' AND last_name = 'Rivière') = 1;
UPDATE customers SET account_balance = COALESCE(account_balance,0) - 1.7, updated_at = now()
 WHERE id = (SELECT id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Brigitte' AND last_name = 'Villette')
   AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Brigitte' AND last_name = 'Villette') = 1;

-- ============================================================
-- SECTION 4 : corrige 2 crédits importés À L'ENVERS comme des
-- dettes par l'import précédent (erreur dans ce fichier-là,
-- déjà corrigée dans celui utilisé pour les 1430 clients) :
-- remet leur solde à 0 avant de créer leur bon d'achat ci-dessous.
-- ============================================================
UPDATE customers SET account_balance = COALESCE(account_balance,0) + 60.00, updated_at = now()
 WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'Jourdan Assurance';
UPDATE customers SET account_balance = COALESCE(account_balance,0) + 35.00, updated_at = now()
 WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'RESTAURANT GALLOS EXPERIENCE';

-- ============================================================
-- SECTION 5 : crée un bon d'achat (gift_cards, kind='voucher') pour
-- chacun des 27 crédits de l'ancien système, rattaché à la
-- fiche client correspondante (une seule correspondance exigée).
-- Pas de date d'expiration (reprise d'un crédit déjà acquis).
-- ============================================================
-- Maryvonne Bansard : 30.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Maryvonne' AND last_name = 'Bansard';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Maryvonne' AND last_name = 'Bansard') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2904275179790', 30.0, 30.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 30.0, 30.0);
  END IF;
END $$;
-- Yolande Fardoit : 30.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Yolande' AND last_name = 'Fardoit';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Yolande' AND last_name = 'Fardoit') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2908695986624', 30.0, 30.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 30.0, 30.0);
  END IF;
END $$;
-- Jourdan Assurance : 60.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'Jourdan Assurance';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'Jourdan Assurance') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2901162128725', 60.0, 60.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 60.0, 60.0);
  END IF;
END $$;
-- Israël : 35.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = 'Israël';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name IS NULL AND last_name = 'Israël') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2969849261097', 35.0, 35.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 35.0, 35.0);
  END IF;
END $$;
-- Justine Guilloreau : 60.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Justine' AND last_name = 'Guilloreau';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Justine' AND last_name = 'Guilloreau') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2902024418916', 60.0, 60.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 60.0, 60.0);
  END IF;
END $$;
-- LECANU CELINE COMES : 91.1€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'LECANU CELINE' AND last_name = 'COMES';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'LECANU CELINE' AND last_name = 'COMES') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2990197558720', 91.1, 91.1, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 91.1, 91.1);
  END IF;
END $$;
-- AUVRAY Famille : 120.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'AUVRAY' AND last_name = 'Famille';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'AUVRAY' AND last_name = 'Famille') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2921509452917', 120.0, 120.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 120.0, 120.0);
  END IF;
END $$;
-- RESTAURANT GALLOS EXPERIENCE : 35.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'RESTAURANT GALLOS EXPERIENCE';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND company_name = 'RESTAURANT GALLOS EXPERIENCE') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2981475607698', 35.0, 35.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 35.0, 35.0);
  END IF;
END $$;
-- Clémence Cotreuil : 4.25€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Clémence' AND last_name = 'Cotreuil';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Clémence' AND last_name = 'Cotreuil') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2915212941868', 4.25, 4.25, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 4.25, 4.25);
  END IF;
END $$;
-- Lainé Famille : 50.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Lainé' AND last_name = 'Famille';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Lainé' AND last_name = 'Famille') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2979020112056', 50.0, 50.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 50.0, 50.0);
  END IF;
END $$;
-- Julie Bisson : 31.2€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Julie' AND last_name = 'Bisson';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Julie' AND last_name = 'Bisson') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2918747561013', 31.2, 31.2, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 31.2, 31.2);
  END IF;
END $$;
-- Mauricette Poirier : 411.1€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Mauricette' AND last_name = 'Poirier';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Mauricette' AND last_name = 'Poirier') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2936396499655', 411.1, 411.1, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 411.1, 411.1);
  END IF;
END $$;
-- Sylvie Racinet : 90.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Sylvie' AND last_name = 'Racinet';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Sylvie' AND last_name = 'Racinet') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2965028230342', 90.0, 90.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 90.0, 90.0);
  END IF;
END $$;
-- céline vallet : 200.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'céline' AND last_name = 'vallet';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'céline' AND last_name = 'vallet') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2935336630783', 200.0, 200.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 200.0, 200.0);
  END IF;
END $$;
-- nicole Boulais : 28.1€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'nicole' AND last_name = 'Boulais';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'nicole' AND last_name = 'Boulais') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2901008988810', 28.1, 28.1, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 28.1, 28.1);
  END IF;
END $$;
-- Charlotte pasquet : 243.45€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Charlotte' AND last_name = 'pasquet';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Charlotte' AND last_name = 'pasquet') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2995432762306', 243.45, 243.45, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 243.45, 243.45);
  END IF;
END $$;
-- Nadine Pasquet : 170.95€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Nadine' AND last_name = 'Pasquet';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Nadine' AND last_name = 'Pasquet') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2913199636616', 170.95, 170.95, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 170.95, 170.95);
  END IF;
END $$;
-- Suzon Deroin : 24.8€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Suzon' AND last_name = 'Deroin';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Suzon' AND last_name = 'Deroin') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2902615548282', 24.8, 24.8, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 24.8, 24.8);
  END IF;
END $$;
-- Stéphanie Guillin : 60.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Stéphanie' AND last_name = 'Guillin';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Stéphanie' AND last_name = 'Guillin') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2992333014749', 60.0, 60.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 60.0, 60.0);
  END IF;
END $$;
-- mireille Maurice : 4.2€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'mireille' AND last_name = 'Maurice';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'mireille' AND last_name = 'Maurice') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2917525303722', 4.2, 4.2, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 4.2, 4.2);
  END IF;
END $$;
-- Sonia Bouzidi : 80.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Sonia' AND last_name = 'Bouzidi';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Sonia' AND last_name = 'Bouzidi') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2949747748784', 80.0, 80.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 80.0, 80.0);
  END IF;
END $$;
-- camille toutain : 63.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'camille' AND last_name = 'toutain';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'camille' AND last_name = 'toutain') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2996689139293', 63.0, 63.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 63.0, 63.0);
  END IF;
END $$;
-- Catherine Gallerand : 81.9€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Catherine' AND last_name = 'Gallerand';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Catherine' AND last_name = 'Gallerand') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2901133398041', 81.9, 81.9, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 81.9, 81.9);
  END IF;
END $$;
-- aline Riviere : 50.3€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'aline' AND last_name = 'Riviere';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'aline' AND last_name = 'Riviere') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2927764157741', 50.3, 50.3, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 50.3, 50.3);
  END IF;
END $$;
-- Véronique Marquet : 213.1€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Véronique' AND last_name = 'Marquet';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Véronique' AND last_name = 'Marquet') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2972155551677', 213.1, 213.1, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 213.1, 213.1);
  END IF;
END $$;
-- yvan Adde : 69.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'yvan' AND last_name = 'Adde';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'yvan' AND last_name = 'Adde') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2954337254637', 69.0, 69.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 69.0, 69.0);
  END IF;
END $$;
-- Catherine Gadeyne : 113.0€
DO $$
DECLARE cust_id uuid; gc_id uuid;
BEGIN
  SELECT id INTO cust_id FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Catherine' AND last_name = 'Gadeyne';
  IF cust_id IS NOT NULL AND (SELECT COUNT(*) FROM customers WHERE organization_id = '7d74c3bb-25b5-41f7-92cc-50d3714a0afb' AND first_name = 'Catherine' AND last_name = 'Gadeyne') = 1 THEN
    INSERT INTO gift_cards (organization_id, code, initial_amount, balance, beneficiary_id, status, kind)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', '2994802422321', 113.0, 113.0, cust_id, 'active', 'voucher')
    RETURNING id INTO gc_id;
    INSERT INTO gift_card_movements (organization_id, gift_card_id, movement_type, amount_delta, balance_after)
    VALUES ('7d74c3bb-25b5-41f7-92cc-50d3714a0afb', gc_id, 'issue', 113.0, 113.0);
  END IF;
END $$;
