-- Migration de DONNÉES (pas de changement de schéma) : remet une majuscule
-- aux prénoms/noms de clients saisis tout en minuscules ou tout en
-- majuscules (ex. "jean dupont", "JEAN DUPONT" -> "Jean Dupont"), toutes
-- organisations confondues.
--
-- initcap() capitalise chaque segment de mot (coupure sur tout caractère
-- non alphanumérique : espace, trait d'union, apostrophe) et met le reste en
-- minuscule — gère correctement les accents ("élodie" -> "Élodie") et les
-- noms composés ("jean-pierre" -> "Jean-Pierre", "o'brien" -> "O'Brien").
-- N'affecte pas company_name, dont la casse est volontairement laissée
-- telle que saisie (raison sociale, parfois stylisée).
UPDATE customers
   SET first_name = initcap(first_name)
 WHERE first_name IS NOT NULL AND first_name <> initcap(first_name);

UPDATE customers
   SET last_name = initcap(last_name)
 WHERE last_name IS NOT NULL AND last_name <> initcap(last_name);
