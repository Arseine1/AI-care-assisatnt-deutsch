-- GÉNÉRÉ par data/scripts/generer-sql.mjs : ne pas modifier à la main.
-- Données 100 % fictives. Rejouable : remplace les données de test et rafraîchit les horodatages.
BEGIN;
TRUNCATE soins.residents RESTART IDENTITY CASCADE;

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-001', 'Mme', 'Greta', 'Schulz', '1938-03-14', 'F', '10', 1, '2022-02-01',
  ARRAY['Fibrillation auriculaire permanente', 'Antécédent d''embolie pulmonaire', 'Hypertension artérielle', 'Anticoagulation au long cours (Marcumar)']::text[],
  '{}'::text[],
  'Alimentation normale avec apport régulier en vitamine K (légumes verts en quantité constante, à cause du Marcumar).', ARRAY['Saignement (anticoagulant)', 'Chute avec traumatisme crânien', 'Interactions médicamenteuses']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'logiciel_soins', 'PAT-001');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'fhir', 'aicare-schulz');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'epa_kvnr', 'Z000000010');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'capteur', 'lora-lit-010');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'chambre', '10');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Marcumar (phenprocoumon)', '3 mg', 'le soir, selon INR (cible 2,0–3,0)', 'Fibrillation auriculaire / prévention embolique', 'Contrôle INR chaque semaine. Anticoagulant : ne jamais associer un second anticoagulant sans avis médical.');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Bisoprolol', '2,5 mg', '1-0-0', 'Fréquence cardiaque', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Ramipril', '2,5 mg', '1-0-0', 'Hypertension', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '180 minutes', 'tension', '134/80', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '180 minutes', 'pouls', '72', '/min (irrégulier)');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '1500 minutes', 'inr', '2,6', '');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '80 minutes', 'IDE Keller', 'medication', 'Marcumar 3 mg donné à 18h selon le schéma. Aucun saignement visible des gencives, pas de nouvel hématome.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '400 minutes', 'AS Braun', 'observation', 'Nuit calme, sommeil continu. Peau intacte, ancien hématome du bras droit en régression.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '1500 minutes', 'IDE Keller', 'medication', 'INR du jour : 2,6 (cible 2,0–3,0). Dose de Marcumar inchangée sur avis du médecin traitant.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '4000 minutes', 'IDE Hartmann', 'transmission', 'Rappel à l''équipe : le Marcumar est un anticoagulant à surveiller ; aucune autre molécule anticoagulante sans accord du médecin.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '12000 minutes', 'IDE Keller', 'transmission', 'Rendez-vous de cardiologie prévu cette semaine, courrier du cardiologue attendu.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-002', 'M.', 'Heinz', 'Müller', '1934-05-09', 'M', '11', 1, '2021-06-15',
  ARRAY['BPCO, stade GOLD 3', 'Insuffisance cardiaque chronique, NYHA II']::text[],
  '{}'::text[],
  'Pauvre en sel, restriction hydrique à 1,5 L par jour.', ARRAY['Dyspnée nocturne', 'Décompensation cardiaque', 'Chute']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'logiciel_soins', 'PAT-002');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'fhir', 'aicare-mueller-1');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'epa_kvnr', 'Z000000011');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'capteur', 'lora-lit-011');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'chambre', '11');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Furosémide', '40 mg', '1-0-0', 'Insuffisance cardiaque', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Tiotropium', '18 µg', '1-0-0 (inhalation)', 'BPCO', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Salbutamol', '100 µg', 'si dyspnée, 2 bouffées', 'BPCO', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Ramipril', '5 mg', '1-0-0', 'Insuffisance cardiaque', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '200 minutes', 'spo2', '92', '%');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '200 minutes', 'tension', '126/72', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '2000 minutes', 'poids', '82,5', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '200 minutes', 'IDE Hartmann', 'observation', 'Dyspnée modérée à l''effort, SpO2 92 % à l''air ambiant. Salbutamol 2 bouffées avec bon effet.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '700 minutes', 'AS Braun', 'observation', 'Nuit : toux, installé en position semi-assise, SpO2 93 %.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '2000 minutes', 'IDE Keller', 'observation', 'Poids 82,5 kg (+1,2 kg en 3 jours), chevilles légèrement œdématiées. Médecin informé.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '6000 minutes', 'IDE Hartmann', 'soins', 'Kinésithérapie respiratoire réalisée, bonne participation.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-003', 'M.', 'Hans', 'Weber', '1941-11-23', 'M', '12', 1, '2023-01-09',
  ARRAY['Hypertension artérielle', 'Gonarthrose bilatérale', 'Trouble cognitif léger avec désorientation nocturne', 'Antécédent de chutes à répétition (2 chutes en 2024)']::text[],
  ARRAY['Pénicilline (Urticaire généralisée)']::text[],
  'Alimentation normale, pauvre en sel.', ARRAY['Chute (risque élevé)', 'Désorientation nocturne', 'Allergie à la pénicilline : aucun antibiotique de la famille des pénicillines']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'logiciel_soins', 'PAT-003');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'fhir', 'aicare-weber');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'epa_kvnr', 'Z000000012');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'capteur', 'lora-lit-012');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'chambre', '12');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Ramipril', '5 mg', '1-0-0', 'Hypertension', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Amlodipine', '5 mg', '1-0-0', 'Hypertension', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Paracétamol', '500 mg', 'si douleur, max 3 g/jour', 'Douleurs articulaires', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '290 minutes', 'tension', '142/86', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '290 minutes', 'pouls', '88', '/min');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '2200 minutes', 'temperature', '37,8', '°C');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '4320 minutes', 'poids', '78,4', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '300 minutes', 'IDE Keller', 'incident', 'Chute constatée à ' || to_char(now() - interval '300 minutes', 'HH24"h"MI') || ' : M. Weber retrouvé au sol à côté du lit en allant aux toilettes. Pas de perte de connaissance, douleur à la hanche gauche (EVA 4/10), pas de déformation visible. Tension 142/86, pouls 88. Médecin d''astreinte prévenu, surveillance neurologique toutes les 2 heures. Protocole de chute appliqué.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '240 minutes', 'IDE Keller', 'observation', 'Surveillance après la chute : orienté, répond correctement, douleur de la hanche stable (EVA 3/10). Mobilisé au fauteuil avec l''aide de deux personnes.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '120 minutes', 'AS Braun', 'transmission', 'Transmission de la chute de cette nuit à l''équipe du matin. Lit en position basse, tapis de sol demandé, sonnette à portée de main.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '60 minutes', 'AS Braun', 'alimentation', 'Petit-déjeuner pris à moitié, a bien bu (250 ml).');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '2200 minutes', 'IDE Hartmann', 'observation', 'Toux grasse depuis deux jours, température 37,8 °C. Médecin traitant contacté pour une consultation, courrier attendu.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '7000 minutes', 'AS Braun', 'observation', 'Désorientation nocturne passagère, rassuré, retour au lit sans difficulté.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '20000 minutes', 'IDE Hartmann', 'transmission', 'Réunion d''équipe : risque de chute élevé, tapis de sol et éclairage de nuit envisagés.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-004', 'M.', 'Karl', 'Becker', '1939-01-27', 'M', '14', 1, '2022-09-20',
  ARRAY['Diabète de type 2 insulino-traité', 'Neuropathie diabétique des pieds', 'Hypoglycémies nocturnes récidivantes']::text[],
  '{}'::text[],
  'Régime diabétique 1 800 kcal, collation tardive obligatoire au coucher.', ARRAY['Hypoglycémie nocturne', 'Chute (hypoglycémie, neuropathie)', 'Lésions du pied']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'logiciel_soins', 'PAT-004');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'fhir', 'aicare-becker');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'epa_kvnr', 'Z000000014');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'capteur', 'lora-lit-014');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'chambre', '14');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Insuline glargine', '18 UI', 'le soir à 21h', 'Diabète de type 2', 'Dose à réévaluer par le diabétologue (hypoglycémies nocturnes).');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Insuline lispro', 'selon schéma', 'avant les repas', 'Diabète de type 2', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Metformine', '500 mg', '1-0-1', 'Diabète de type 2', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-004', now() - interval '545 minutes', 'glycemie', '52', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-004', now() - interval '530 minutes', 'glycemie', '78', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-004', now() - interval '480 minutes', 'glycemie', '96', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-004', now() - interval '100 minutes', 'glycemie', '118', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-004', now() - interval '100 minutes', 'tension', '128/76', 'mmHg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '545 minutes', 'AS Braun', 'incident', 'Hypoglycémie nocturne à ' || to_char(now() - interval '545 minutes', 'HH24"h"MI') || ' : glycémie 52 mg/dl, sueurs et tremblements. 15 g de glucose administrés, recontrôle à 15 minutes : 78 mg/dl, puis collation. Médecin informé ce matin.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '480 minutes', 'AS Braun', 'observation', 'Glycémie recontrôlée à ' || to_char(now() - interval '480 minutes', 'HH24"h"MI') || ' : 96 mg/dl, symptômes disparus.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '100 minutes', 'IDE Keller', 'observation', 'Glycémie à jeun 118 mg/dl. Petit-déjeuner complet pris.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '1900 minutes', 'AS Braun', 'incident', 'Deuxième hypoglycémie nocturne cette semaine : glycémie 58 mg/dl à ' || to_char(now() - interval '1900 minutes', 'HH24"h"MI') || ', resucrage effectué.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '3500 minutes', 'IDE Hartmann', 'transmission', 'Troisième hypoglycémie nocturne en 5 jours. Réévaluation de l''insuline basale demandée au diabétologue.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '9000 minutes', 'IDE Keller', 'soins', 'Examen des pieds : peau sèche, pas de plaie ni de rougeur.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-005', 'M.', 'Otto', 'Wagner', '1936-08-05', 'M', '20', 2, '2020-11-03',
  ARRAY['Insuffisance rénale chronique stade 4', 'Hypertension artérielle', 'Anémie rénale', 'Goutte']::text[],
  '{}'::text[],
  'Pauvre en potassium et en phosphate, restriction hydrique à 1 L par jour.', ARRAY['Hyperkaliémie', 'Médicaments néphrotoxiques : anti-inflammatoires non stéroïdiens (AINS) contre-indiqués', 'Surcharge hydrique']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'logiciel_soins', 'PAT-005');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'fhir', 'aicare-wagner');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'epa_kvnr', 'Z000000020');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'capteur', 'lora-lit-020');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'chambre', '20');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Amlodipine', '5 mg', '1-0-0', 'Hypertension', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Torasémide', '10 mg', '1-0-0', 'Diurétique', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Allopurinol', '100 mg', '1-0-0', 'Goutte (dose adaptée à la fonction rénale)', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Érythropoïétine', '4 000 UI', 'une fois par semaine', 'Anémie rénale', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '150 minutes', 'tension', '148/84', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '150 minutes', 'poids', '71,2', 'kg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '1600 minutes', 'potassium', '5,1', 'mmol/l');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '150 minutes', 'IDE Neumann', 'observation', 'Diurèse 900 ml sur 24 h, poids 71,2 kg (stable). Restriction hydrique de 1 L respectée.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '500 minutes', 'AS Richter', 'observation', 'Nuit calme. Démangeaisons cutanées légères (urémie), crème apaisante appliquée.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '1600 minutes', 'IDE Neumann', 'observation', 'Bilan sanguin : créatinine 2,9 mg/dl, DFG 22 ml/min, potassium 5,1 mmol/l. Médecin informé.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '5000 minutes', 'IDE Neumann', 'transmission', 'Rappel : les AINS (ibuprofène, diclofénac) sont contre-indiqués (insuffisance rénale stade 4), mentionné dans le plan de soins.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '15000 minutes', 'IDE Neumann', 'transmission', 'Visite du néphrologue : poursuite du traitement conservateur, dialyse non indiquée pour l''instant. Douleurs du dos signalées, médecin traitant à consulter.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-006', 'M.', 'Heinz', 'Müller', '1947-12-01', 'M', '21', 2, '2023-05-22',
  ARRAY['Diabète de type 2', 'Hypertension artérielle', 'Allergie aux sulfamides']::text[],
  ARRAY['Sulfamides (sulfonamides, dont le cotrimoxazole) (Éruption cutanée sévère)']::text[],
  'Régime diabétique 1 900 kcal.', ARRAY['Allergie aux sulfamides', 'Infections urinaires', 'Hyperglycémie']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'logiciel_soins', 'PAT-006');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'fhir', 'aicare-mueller-2');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'epa_kvnr', 'Z000000021');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'capteur', 'lora-lit-021');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'chambre', '21');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-006', 'Metformine', '1000 mg', '1-0-1', 'Diabète de type 2', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-006', 'Candésartan', '8 mg', '1-0-0', 'Hypertension', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '130 minutes', 'glycemie', '142', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '130 minutes', 'tension', '136/82', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '600 minutes', 'temperature', '37,9', '°C');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '130 minutes', 'IDE Neumann', 'observation', 'Glycémie à jeun 142 mg/dl. Metformine donnée au petit-déjeuner.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '600 minutes', 'AS Richter', 'observation', 'Brûlures en urinant depuis hier, urine trouble. Bandelette urinaire positive (leucocytes), température 37,9 °C. Médecin traitant informé, courrier attendu.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '3000 minutes', 'IDE Neumann', 'transmission', 'Allergie aux sulfamides (éruption cutanée) rappelée dans le dossier et vérifiée avec la famille.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '9000 minutes', 'IDE Neumann', 'soins', 'Attention aux homonymes : deux résidents nommés Heinz Müller dans la maison (chambres 11 et 21). Toujours vérifier la date de naissance : celui-ci est né le 01.12.1947.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-007', 'Mme', 'Elisabeth', 'Fischer', '1943-04-19', 'F', '22', 2, '2022-12-12',
  ARRAY['Gonarthrose du genou droit', 'Ostéoporose', 'Hypothyroïdie']::text[],
  '{}'::text[],
  'Alimentation normale, riche en calcium.', ARRAY['Fracture (ostéoporose)', 'Escarre (mobilité réduite)', 'Douleur du genou']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'logiciel_soins', 'PAT-007');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'fhir', 'aicare-fischer');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'epa_kvnr', 'Z000000022');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'capteur', 'lora-lit-022');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'chambre', '22');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Lévothyroxine', '75 µg', '1-0-0, à jeun', 'Hypothyroïdie', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Calcium + vitamine D3', '500 mg / 1000 UI', '0-0-1', 'Ostéoporose', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Paracétamol', '500 mg', 'si douleur, max 3 g/jour', 'Douleur du genou', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '100 minutes', 'tension', '130/78', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '100 minutes', 'pouls', '68', '/min');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '4000 minutes', 'poids', '59,0', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '100 minutes', 'IDE Neumann', 'soins', 'Mobilisation avec la kinésithérapeute, marche de 20 m avec déambulateur.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '800 minutes', 'AS Richter', 'soins', 'Nuit calme, changements de position toutes les 3 heures (prévention des escarres).');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '2500 minutes', 'IDE Neumann', 'medication', 'Douleur du genou droit EVA 5/10 en fin de journée, paracétamol à la demande donné avec bon effet.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '10000 minutes', 'IDE Neumann', 'transmission', 'Consultation orthopédique effectuée, courrier du spécialiste attendu.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-008', 'Mme', 'Lotte', 'Hoffmann', '1940-10-30', 'F', '23', 2, '2021-03-08',
  ARRAY['Maladie d''Alzheimer, stade modéré', 'Escarre du sacrum, stade 1', 'Dénutrition modérée']::text[],
  ARRAY['Latex (Urticaire de contact)']::text[],
  'Alimentation hypercalorique, texture adaptée, compléments nutritionnels deux fois par jour.', ARRAY['Escarre', 'Dénutrition', 'Errance et agitation vespérale', 'Allergie au latex : gants sans latex']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'logiciel_soins', 'PAT-008');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'fhir', 'aicare-hoffmann');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'epa_kvnr', 'Z000000023');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'capteur', 'lora-lit-023');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'chambre', '23');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Donépézil', '5 mg', '0-0-1', 'Maladie d''Alzheimer', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Vitamine D3', '1000 UI', '1-0-0', 'Prévention', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Complément nutritionnel hypercalorique', '200 ml', '1-0-1', 'Dénutrition', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-008', now() - interval '180 minutes', 'tension', '118/70', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-008', now() - interval '7000 minutes', 'poids', '47,8', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '180 minutes', 'IDE Neumann', 'soins', 'Rougeur du sacrum (stade 1) stable, pansement préventif renouvelé, changement de position toutes les 2 heures.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '650 minutes', 'AS Richter', 'observation', 'Agitation en soirée, errance dans le couloir ; calmée par un accompagnement et une boisson chaude. Pas de contention.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '1700 minutes', 'AS Richter', 'alimentation', 'A mangé 50 % du repas, complément hypercalorique proposé et accepté.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '7000 minutes', 'IDE Neumann', 'transmission', 'Pesée : 47,8 kg (−0,8 kg en 2 semaines), diététicienne informée.');

COMMIT;
