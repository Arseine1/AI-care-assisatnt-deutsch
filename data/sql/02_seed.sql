-- ERZEUGT von data/scripts/generer-sql.mjs: nicht von Hand ändern.
-- 100 % fiktive Daten. Wiederholbar: ersetzt die Testdaten und aktualisiert die Zeitstempel.
BEGIN;
TRUNCATE soins.residents RESTART IDENTITY CASCADE;

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-001', 'Frau', 'Greta', 'Schulz', '1938-03-14', 'F', '10', 1, '2022-02-01',
  ARRAY['Permanentes Vorhofflimmern', 'Z. n. Lungenembolie', 'Arterielle Hypertonie', 'Dauerantikoagulation (Marcumar)']::text[],
  '{}'::text[],
  'Normale Kost mit regelmäßiger Vitamin-K-Zufuhr (grünes Gemüse in gleichbleibender Menge, wegen Marcumar).', ARRAY['Blutung (Antikoagulans)', 'Sturz mit Schädel-Hirn-Trauma', 'Arzneimittelwechselwirkungen']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'logiciel_soins', 'PAT-001');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'fhir', 'aicare-schulz');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'epa_kvnr', 'Z000000010');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'capteur', 'lora-lit-010');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-001', 'chambre', '10');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Marcumar (phenprocoumon)', '3 mg', 'abends, nach INR (Zielbereich 2,0–3,0)', 'Vorhofflimmern / Embolieprophylaxe', 'INR-Kontrolle jede Woche. Antikoagulans: niemals ein zweites Antikoagulans ohne ärztliche Rücksprache hinzufügen.');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Bisoprolol', '2,5 mg', '1-0-0', 'Herzfrequenz', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-001', 'Ramipril', '2,5 mg', '1-0-0', 'Hypertonie', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '180 minutes', 'tension', '134/80', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '180 minutes', 'pouls', '72', '/min (unregelmäßig)');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-001', now() - interval '1500 minutes', 'inr', '2,6', '');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '80 minutes', 'PFK Keller', 'medication', 'Marcumar 3 mg um 18 Uhr nach Schema gegeben. Kein sichtbares Zahnfleischbluten, kein neues Hämatom.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '400 minutes', 'PH Braun', 'observation', 'Ruhige Nacht, durchgehender Schlaf. Haut intakt, altes Hämatom am rechten Arm rückläufig.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '1500 minutes', 'PFK Keller', 'medication', 'INR heute: 2,6 (Zielbereich 2,0–3,0). Marcumar-Dosis unverändert nach Rücksprache mit dem Hausarzt.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '4000 minutes', 'PFK Hartmann', 'transmission', 'Erinnerung an das Team: Marcumar ist ein Antikoagulans, das überwacht werden muss; kein weiterer gerinnungshemmender Wirkstoff ohne Zustimmung des Arztes.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-001', now() - interval '12000 minutes', 'PFK Keller', 'transmission', 'Kardiologie-Termin diese Woche geplant, Brief des Kardiologen wird erwartet.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-002', 'Herr', 'Heinz', 'Müller', '1934-05-09', 'M', '11', 1, '2021-06-15',
  ARRAY['COPD, Stadium GOLD 3', 'Chronische Herzinsuffizienz, NYHA II']::text[],
  '{}'::text[],
  'Salzarm, Trinkmengenbeschränkung auf 1,5 l pro Tag.', ARRAY['Nächtliche Atemnot', 'Kardiale Dekompensation', 'Sturz']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'logiciel_soins', 'PAT-002');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'fhir', 'aicare-mueller-1');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'epa_kvnr', 'Z000000011');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'capteur', 'lora-lit-011');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-002', 'chambre', '11');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Furosemid', '40 mg', '1-0-0', 'Herzinsuffizienz', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Tiotropium', '18 µg', '1-0-0 (Inhalation)', 'COPD', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Salbutamol', '100 µg', 'bei Atemnot, 2 Hübe', 'COPD', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-002', 'Ramipril', '5 mg', '1-0-0', 'Herzinsuffizienz', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '200 minutes', 'spo2', '92', '%');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '200 minutes', 'tension', '126/72', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-002', now() - interval '2000 minutes', 'poids', '82,5', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '200 minutes', 'PFK Hartmann', 'observation', 'Mäßige Belastungsdyspnoe, SpO2 92 % unter Raumluft. Salbutamol 2 Hübe mit gutem Effekt.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '700 minutes', 'PH Braun', 'observation', 'Nacht: Husten, in halbsitzender Position gelagert, SpO2 93 %.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '2000 minutes', 'PFK Keller', 'observation', 'Gewicht 82,5 kg (+1,2 kg in 3 Tagen), Knöchel leicht ödematös. Arzt informiert.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-002', now() - interval '6000 minutes', 'PFK Hartmann', 'soins', 'Atemphysiotherapie durchgeführt, gute Mitarbeit.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-003', 'Herr', 'Hans', 'Weber', '1941-11-23', 'M', '12', 1, '2023-01-09',
  ARRAY['Arterielle Hypertonie', 'Beidseitige Gonarthrose', 'Leichte kognitive Störung mit nächtlicher Desorientierung', 'Z. n. wiederholten Stürzen (2 Stürze 2024)']::text[],
  ARRAY['Penicillin (Generalisierte Urtikaria)']::text[],
  'Normale Kost, salzarm.', ARRAY['Sturz (hohes Risiko)', 'Nächtliche Desorientierung', 'Penicillin-Allergie: kein Antibiotikum aus der Gruppe der Penicilline']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'logiciel_soins', 'PAT-003');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'fhir', 'aicare-weber');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'epa_kvnr', 'Z000000012');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'capteur', 'lora-lit-012');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-003', 'chambre', '12');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Ramipril', '5 mg', '1-0-0', 'Hypertonie', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Amlodipin', '5 mg', '1-0-0', 'Hypertonie', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-003', 'Paracetamol', '500 mg', 'bei Schmerzen, max. 3 g/Tag', 'Gelenkschmerzen', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '290 minutes', 'tension', '142/86', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '290 minutes', 'pouls', '88', '/min');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '2200 minutes', 'temperature', '37,8', '°C');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-003', now() - interval '4320 minutes', 'poids', '78,4', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '300 minutes', 'PFK Keller', 'incident', 'Sturz festgestellt um ' || to_char(now() - interval '300 minutes', 'HH24"h"MI') || ': Herr Weber auf dem Weg zur Toilette neben dem Bett am Boden liegend aufgefunden. Kein Bewusstseinsverlust, Schmerzen in der linken Hüfte (VAS 4/10), keine sichtbare Fehlstellung. Blutdruck 142/86, Puls 88. Bereitschaftsarzt benachrichtigt, neurologische Überwachung alle 2 Stunden. Sturzprotokoll angewendet.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '240 minutes', 'PFK Keller', 'observation', 'Überwachung nach dem Sturz: orientiert, antwortet korrekt, Hüftschmerz stabil (VAS 3/10). Mit Hilfe von zwei Personen in den Stuhl mobilisiert.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '120 minutes', 'PH Braun', 'transmission', 'Übergabe des nächtlichen Sturzes an das Frühdienstteam. Bett in niedriger Position, Bodenmatte angefordert, Klingel in Reichweite.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '60 minutes', 'PH Braun', 'alimentation', 'Frühstück zur Hälfte gegessen, hat gut getrunken (250 ml).');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '2200 minutes', 'PFK Hartmann', 'observation', 'Produktiver Husten seit zwei Tagen, Temperatur 37,8 °C. Hausarzt für eine Konsultation kontaktiert, Brief wird erwartet.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '7000 minutes', 'PH Braun', 'observation', 'Vorübergehende nächtliche Desorientierung, beruhigt, ohne Schwierigkeiten zurück ins Bett gegangen.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-003', now() - interval '20000 minutes', 'PFK Hartmann', 'transmission', 'Teambesprechung: hohes Sturzrisiko, Bodenmatte und Nachtbeleuchtung werden erwogen.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-004', 'Herr', 'Karl', 'Becker', '1939-01-27', 'M', '14', 1, '2022-09-20',
  ARRAY['Insulinpflichtiger Diabetes mellitus Typ 2', 'Diabetische Neuropathie der Füße', 'Rezidivierende nächtliche Hypoglykämien']::text[],
  '{}'::text[],
  'Diabetikerkost 1 800 kcal, späte Zwischenmahlzeit vor dem Schlafengehen obligatorisch.', ARRAY['Nächtliche Hypoglykämie', 'Sturz (Hypoglykämie, Neuropathie)', 'Fußverletzungen']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'logiciel_soins', 'PAT-004');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'fhir', 'aicare-becker');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'epa_kvnr', 'Z000000014');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'capteur', 'lora-lit-014');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-004', 'chambre', '14');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Insulin glargin', '18 IE', 'abends um 21 Uhr', 'Diabetes mellitus Typ 2', 'Dosis durch den Diabetologen neu zu bewerten (nächtliche Hypoglykämien).');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Insulin lispro', 'nach Schema', 'vor den Mahlzeiten', 'Diabetes mellitus Typ 2', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-004', 'Metformin', '500 mg', '1-0-1', 'Diabetes mellitus Typ 2', NULL);
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
VALUES ('PAT-004', now() - interval '545 minutes', 'PH Braun', 'incident', 'Nächtliche Hypoglykämie um ' || to_char(now() - interval '545 minutes', 'HH24"h"MI') || ': Blutzucker 52 mg/dl, Schweißausbruch und Zittern. 15 g Glukose verabreicht, Kontrolle nach 15 Minuten: 78 mg/dl, danach Zwischenmahlzeit. Arzt heute Morgen informiert.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '480 minutes', 'PH Braun', 'observation', 'Blutzucker um ' || to_char(now() - interval '480 minutes', 'HH24"h"MI') || ' nachkontrolliert: 96 mg/dl, Symptome verschwunden.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '100 minutes', 'PFK Keller', 'observation', 'Nüchternblutzucker 118 mg/dl. Vollständiges Frühstück gegessen.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '1900 minutes', 'PH Braun', 'incident', 'Zweite nächtliche Hypoglykämie in dieser Woche: Blutzucker 58 mg/dl um ' || to_char(now() - interval '1900 minutes', 'HH24"h"MI') || ', Glukosegabe erfolgt.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '3500 minutes', 'PFK Hartmann', 'transmission', 'Dritte nächtliche Hypoglykämie in 5 Tagen. Neubewertung des Basalinsulins beim Diabetologen angefordert.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-004', now() - interval '9000 minutes', 'PFK Keller', 'soins', 'Fußinspektion: trockene Haut, keine Wunde, keine Rötung.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-005', 'Herr', 'Otto', 'Wagner', '1936-08-05', 'M', '20', 2, '2020-11-03',
  ARRAY['Chronische Niereninsuffizienz Stadium 4', 'Arterielle Hypertonie', 'Renale Anämie', 'Gicht']::text[],
  '{}'::text[],
  'Kalium- und phosphatarm, Trinkmengenbeschränkung auf 1 l pro Tag.', ARRAY['Hyperkaliämie', 'Nephrotoxische Medikamente: nichtsteroidale Antirheumatika (NSAR) kontraindiziert', 'Flüssigkeitsüberlastung']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'logiciel_soins', 'PAT-005');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'fhir', 'aicare-wagner');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'epa_kvnr', 'Z000000020');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'capteur', 'lora-lit-020');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-005', 'chambre', '20');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Amlodipin', '5 mg', '1-0-0', 'Hypertonie', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Torasemid', '10 mg', '1-0-0', 'Diuretikum', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Allopurinol', '100 mg', '1-0-0', 'Gicht (an die Nierenfunktion angepasste Dosis)', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-005', 'Erythropoetin', '4 000 IE', 'einmal pro Woche', 'Renale Anämie', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '150 minutes', 'tension', '148/84', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '150 minutes', 'poids', '71,2', 'kg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-005', now() - interval '1600 minutes', 'potassium', '5,1', 'mmol/l');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '150 minutes', 'PFK Neumann', 'observation', 'Diurese 900 ml in 24 h, Gewicht 71,2 kg (stabil). Trinkmengenbeschränkung von 1 l eingehalten.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '500 minutes', 'PH Richter', 'observation', 'Ruhige Nacht. Leichter Juckreiz der Haut (Urämie), beruhigende Creme aufgetragen.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '1600 minutes', 'PFK Neumann', 'observation', 'Blutbild: Kreatinin 2,9 mg/dl, GFR 22 ml/min, Kalium 5,1 mmol/l. Arzt informiert.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '5000 minutes', 'PFK Neumann', 'transmission', 'Erinnerung: NSAR (Ibuprofen, Diclofenac) sind kontraindiziert (Niereninsuffizienz Stadium 4), im Pflegeplan vermerkt.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-005', now() - interval '15000 minutes', 'PFK Neumann', 'transmission', 'Visite des Nephrologen: konservative Behandlung wird fortgesetzt, Dialyse derzeit nicht indiziert. Rückenschmerzen gemeldet, Hausarzt zu konsultieren.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-006', 'Herr', 'Heinz', 'Müller', '1947-12-01', 'M', '21', 2, '2023-05-22',
  ARRAY['Diabetes mellitus Typ 2', 'Arterielle Hypertonie', 'Sulfonamid-Allergie']::text[],
  ARRAY['Sulfonamide (einschließlich Cotrimoxazol) (Schwerer Hautausschlag)']::text[],
  'Diabetikerkost 1 900 kcal.', ARRAY['Sulfonamid-Allergie', 'Harnwegsinfektionen', 'Hyperglykämie']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'logiciel_soins', 'PAT-006');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'fhir', 'aicare-mueller-2');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'epa_kvnr', 'Z000000021');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'capteur', 'lora-lit-021');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-006', 'chambre', '21');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-006', 'Metformin', '1000 mg', '1-0-1', 'Diabetes mellitus Typ 2', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-006', 'Candesartan', '8 mg', '1-0-0', 'Hypertonie', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '130 minutes', 'glycemie', '142', 'mg/dl');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '130 minutes', 'tension', '136/82', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-006', now() - interval '600 minutes', 'temperature', '37,9', '°C');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '130 minutes', 'PFK Neumann', 'observation', 'Nüchternblutzucker 142 mg/dl. Metformin zum Frühstück gegeben.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '600 minutes', 'PH Richter', 'observation', 'Brennen beim Wasserlassen seit gestern, trüber Urin. Urinteststreifen positiv (Leukozyten), Temperatur 37,9 °C. Hausarzt informiert, Brief wird erwartet.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '3000 minutes', 'PFK Neumann', 'transmission', 'Sulfonamid-Allergie (Hautausschlag) in der Akte vermerkt und mit der Familie überprüft.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-006', now() - interval '9000 minutes', 'PFK Neumann', 'soins', 'Achtung Namensgleichheit: zwei Bewohner namens Heinz Müller im Haus (Zimmer 11 und 21). Immer das Geburtsdatum prüfen: dieser ist am 01.12.1947 geboren.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-007', 'Frau', 'Elisabeth', 'Fischer', '1943-04-19', 'F', '22', 2, '2022-12-12',
  ARRAY['Gonarthrose des rechten Knies', 'Osteoporose', 'Hypothyreose']::text[],
  '{}'::text[],
  'Normale Kost, kalziumreich.', ARRAY['Fraktur (Osteoporose)', 'Dekubitus (eingeschränkte Mobilität)', 'Knieschmerzen']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'logiciel_soins', 'PAT-007');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'fhir', 'aicare-fischer');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'epa_kvnr', 'Z000000022');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'capteur', 'lora-lit-022');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-007', 'chambre', '22');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Levothyroxin', '75 µg', '1-0-0, nüchtern', 'Hypothyreose', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Calcium + Vitamin D3', '500 mg / 1000 IE', '0-0-1', 'Osteoporose', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-007', 'Paracetamol', '500 mg', 'bei Schmerzen, max. 3 g/Tag', 'Knieschmerzen', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '100 minutes', 'tension', '130/78', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '100 minutes', 'pouls', '68', '/min');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-007', now() - interval '4000 minutes', 'poids', '59,0', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '100 minutes', 'PFK Neumann', 'soins', 'Mobilisation mit der Physiotherapeutin, 20 m Gehen mit Rollator.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '800 minutes', 'PH Richter', 'soins', 'Ruhige Nacht, Lagewechsel alle 3 Stunden (Dekubitusprophylaxe).');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '2500 minutes', 'PFK Neumann', 'medication', 'Schmerzen im rechten Knie VAS 5/10 am späten Nachmittag, Paracetamol bei Bedarf mit gutem Effekt gegeben.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-007', now() - interval '10000 minutes', 'PFK Neumann', 'transmission', 'Orthopädische Konsultation erfolgt, Brief des Facharztes wird erwartet.');

INSERT INTO soins.residents (patient_id, civilite, prenom, nom, date_naissance, sexe, chambre, etage, date_admission, diagnostics, allergies, regime, risques)
VALUES ('PAT-008', 'Frau', 'Lotte', 'Hoffmann', '1940-10-30', 'F', '23', 2, '2021-03-08',
  ARRAY['Alzheimer-Krankheit, mittleres Stadium', 'Dekubitus am Kreuzbein, Stadium 1', 'Mäßige Mangelernährung']::text[],
  ARRAY['Latex (Kontakturtikaria)']::text[],
  'Hochkalorische Kost, angepasste Konsistenz, Trinknahrung zweimal täglich.', ARRAY['Dekubitus', 'Mangelernährung', 'Umherwandern und Unruhe am Abend', 'Latexallergie: latexfreie Handschuhe']::text[]);
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'logiciel_soins', 'PAT-008');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'fhir', 'aicare-hoffmann');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'epa_kvnr', 'Z000000023');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'capteur', 'lora-lit-023');
INSERT INTO soins.correspondance (patient_id, systeme, identifiant) VALUES ('PAT-008', 'chambre', '23');
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Donepezil', '5 mg', '0-0-1', 'Alzheimer-Krankheit', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Vitamin D3', '1000 IE', '1-0-0', 'Prophylaxe', NULL);
INSERT INTO soins.plan_medication (patient_id, medicament, dosage, schema_prise, indication, remarque)
VALUES ('PAT-008', 'Hochkalorische Trinknahrung', '200 ml', '1-0-1', 'Mangelernährung', NULL);
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-008', now() - interval '180 minutes', 'tension', '118/70', 'mmHg');
INSERT INTO soins.signes_vitaux (patient_id, horodatage, type, valeur, unite)
VALUES ('PAT-008', now() - interval '7000 minutes', 'poids', '47,8', 'kg');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '180 minutes', 'PFK Neumann', 'soins', 'Rötung am Kreuzbein (Stadium 1) stabil, vorbeugender Verband erneuert, Lagewechsel alle 2 Stunden.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '650 minutes', 'PH Richter', 'observation', 'Unruhe am Abend, Umherwandern im Flur; durch Begleitung und ein warmes Getränk beruhigt. Keine Fixierung.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '1700 minutes', 'PH Richter', 'alimentation', '50 % der Mahlzeit gegessen, hochkalorische Trinknahrung angeboten und angenommen.');
INSERT INTO soins.notes_soins (patient_id, horodatage, auteur, categorie, texte)
VALUES ('PAT-008', now() - interval '7000 minutes', 'PFK Neumann', 'transmission', 'Wiegen: 47,8 kg (−0,8 kg in 2 Wochen), Diätassistentin informiert.');

COMMIT;
