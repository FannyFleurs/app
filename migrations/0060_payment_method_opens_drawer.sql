-- Ouverture du tiroir-caisse par mode de règlement : le tiroir s'ouvre à
-- l'encaissement selon le(s) mode(s) utilisé(s) (ex. espèces oui, chèque non),
-- et non à l'impression du ticket.
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS opens_drawer BOOLEAN NOT NULL DEFAULT FALSE;

-- Par défaut : seules les espèces ouvrent le tiroir.
UPDATE payment_methods SET opens_drawer = TRUE WHERE kind = 'cash';
