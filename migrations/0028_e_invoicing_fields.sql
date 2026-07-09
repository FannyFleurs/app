-- Migration 0028 : preparation a la facturation electronique (reforme
-- francaise, generalisation 2026-2027).
--
-- Objectif : anticiper SANS graver le format dans le marbre. On stocke
-- les donnees structurees exigees par l'Etat pour pouvoir, le moment
-- venu, generer un Factur-X / UBL / CII et transmettre la facture via
-- une plateforme agreee (PDP) ou l'exporter en JSON.
--
-- Cote acheteur (customers), les mentions obligatoires dependent du
-- type de client :
--   - particulier (B2C)      : identite + adresse
--   - professionnel (B2B)    : SIREN/SIRET + TVA intracommunautaire
--   - collectivite (B2G)     : SIRET + code service + n° d'engagement
--                              (Chorus Pro)
--   - association            : SIREN/SIRET si assujettie
--
-- Le SIRET (14 chiffres) existe deja ; on ajoute le SIREN (9 chiffres,
-- racine de l'entreprise) car certains formats l'exigent separement.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS siren                TEXT,
  -- Chorus Pro (secteur public) : identifiant du service destinataire.
  ADD COLUMN IF NOT EXISTS public_service_code  TEXT,
  -- Numero d'engagement / bon de commande exige par certaines administrations.
  ADD COLUMN IF NOT EXISTS commitment_number    TEXT,
  -- Pays (code ISO, defaut FR) — utile pour l'auto-liquidation TVA UE.
  ADD COLUMN IF NOT EXISTS country              TEXT NOT NULL DEFAULT 'FR';

-- Cote vendeur : le SIREN de l'organisation (le SIRET du siege existe deja).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS siren TEXT;
