// EINZIGE QUELLE der Testdaten (100 % fiktiv).
// Alles andere (SQL, FHIR-Bundle, Frontend) wird aus dieser Datei erzeugt,
// damit dieselben Bewohner überall mit denselben Angaben erscheinen.
//
// Zeitstempel: `minutes` = „vor N Minuten“ bezogen auf den Zeitpunkt des Ladens.
// In einem Text steht {{h}} für die Uhrzeit der Notiz selbst, {{h:N}} für die Uhrzeit vor N Minuten.

export const MAISON = { nom: 'Haus Sonnenhof', kim: 'pflegeheim-sonnenhof@kim.example.test' };

export const residents = [
  {
    id: 'PAT-001', fhirId: 'aicare-schulz', kvnr: 'Z000000010', capteur: 'lora-lit-010',
    civilite: 'Frau', prenom: 'Greta', nom: 'Schulz', sexe: 'F', naissance: '1938-03-14',
    chambre: '10', etage: 1, admission: '2022-02-01',
    diagnostics: [
      { libelle: 'Permanentes Vorhofflimmern', icd: 'I48.2' },
      { libelle: 'Z. n. Lungenembolie', icd: 'Z86.7' },
      { libelle: 'Arterielle Hypertonie', icd: 'I10' },
      { libelle: 'Dauerantikoagulation (Marcumar)', icd: 'Z79.01' },
    ],
    allergies: [],
    regime: 'Normale Kost mit regelmäßiger Vitamin-K-Zufuhr (grünes Gemüse in gleichbleibender Menge, wegen Marcumar).',
    risques: ['Blutung (Antikoagulans)', 'Sturz mit Schädel-Hirn-Trauma', 'Arzneimittelwechselwirkungen'],
    medication: [
      { nom: 'Marcumar (phenprocoumon)', dosage: '3 mg', schema: 'abends, nach INR (Zielbereich 2,0–3,0)', indication: 'Vorhofflimmern / Embolieprophylaxe', remarque: 'INR-Kontrolle jede Woche. Antikoagulans: niemals ein zweites Antikoagulans ohne ärztliche Rücksprache hinzufügen.' },
      { nom: 'Bisoprolol', dosage: '2,5 mg', schema: '1-0-0', indication: 'Herzfrequenz' },
      { nom: 'Ramipril', dosage: '2,5 mg', schema: '1-0-0', indication: 'Hypertonie' },
    ],
    vitaux: [
      { type: 'tension', valeur: '134/80', unite: 'mmHg', minutes: 180 },
      { type: 'pouls', valeur: '72', unite: '/min (unregelmäßig)', minutes: 180 },
      { type: 'inr', valeur: '2,6', unite: '', minutes: 1500 },
    ],
    labo: [{ code: 'INR', libelle: 'INR', valeur: 2.6, unite: '', joursAvant: 1 }],
    notes: [
      { minutes: 80, auteur: 'PFK Keller', categorie: 'medication', texte: "Marcumar 3 mg um 18 Uhr nach Schema gegeben. Kein sichtbares Zahnfleischbluten, kein neues Hämatom." },
      { minutes: 400, auteur: 'PH Braun', categorie: 'observation', texte: "Ruhige Nacht, durchgehender Schlaf. Haut intakt, altes Hämatom am rechten Arm rückläufig." },
      { minutes: 1500, auteur: 'PFK Keller', categorie: 'medication', texte: "INR heute: 2,6 (Zielbereich 2,0–3,0). Marcumar-Dosis unverändert nach Rücksprache mit dem Hausarzt." },
      { minutes: 4000, auteur: 'PFK Hartmann', categorie: 'transmission', texte: "Erinnerung an das Team: Marcumar ist ein Antikoagulans, das überwacht werden muss; kein weiterer gerinnungshemmender Wirkstoff ohne Zustimmung des Arztes." },
      { minutes: 12000, auteur: 'PFK Keller', categorie: 'transmission', texte: "Kardiologie-Termin diese Woche geplant, Brief des Kardiologen wird erwartet." },
    ],
  },
  {
    id: 'PAT-002', fhirId: 'aicare-mueller-1', kvnr: 'Z000000011', capteur: 'lora-lit-011',
    civilite: 'Herr', prenom: 'Heinz', nom: 'Müller', sexe: 'M', naissance: '1934-05-09',
    chambre: '11', etage: 1, admission: '2021-06-15',
    diagnostics: [
      { libelle: 'COPD, Stadium GOLD 3', icd: 'J44.1' },
      { libelle: 'Chronische Herzinsuffizienz, NYHA II', icd: 'I50.9' },
    ],
    allergies: [],
    regime: 'Salzarm, Trinkmengenbeschränkung auf 1,5 l pro Tag.',
    risques: ['Nächtliche Atemnot', 'Kardiale Dekompensation', 'Sturz'],
    medication: [
      { nom: 'Furosemid', dosage: '40 mg', schema: '1-0-0', indication: 'Herzinsuffizienz' },
      { nom: 'Tiotropium', dosage: '18 µg', schema: '1-0-0 (Inhalation)', indication: 'COPD' },
      { nom: 'Salbutamol', dosage: '100 µg', schema: 'bei Atemnot, 2 Hübe', indication: 'COPD' },
      { nom: 'Ramipril', dosage: '5 mg', schema: '1-0-0', indication: 'Herzinsuffizienz' },
    ],
    vitaux: [
      { type: 'spo2', valeur: '92', unite: '%', minutes: 200 },
      { type: 'tension', valeur: '126/72', unite: 'mmHg', minutes: 200 },
      { type: 'poids', valeur: '82,5', unite: 'kg', minutes: 2000 },
    ],
    labo: [],
    notes: [
      { minutes: 200, auteur: 'PFK Hartmann', categorie: 'observation', texte: "Mäßige Belastungsdyspnoe, SpO2 92 % unter Raumluft. Salbutamol 2 Hübe mit gutem Effekt." },
      { minutes: 700, auteur: 'PH Braun', categorie: 'observation', texte: "Nacht: Husten, in halbsitzender Position gelagert, SpO2 93 %." },
      { minutes: 2000, auteur: 'PFK Keller', categorie: 'observation', texte: "Gewicht 82,5 kg (+1,2 kg in 3 Tagen), Knöchel leicht ödematös. Arzt informiert." },
      { minutes: 6000, auteur: 'PFK Hartmann', categorie: 'soins', texte: "Atemphysiotherapie durchgeführt, gute Mitarbeit." },
    ],
  },
  {
    id: 'PAT-003', fhirId: 'aicare-weber', kvnr: 'Z000000012', capteur: 'lora-lit-012',
    civilite: 'Herr', prenom: 'Hans', nom: 'Weber', sexe: 'M', naissance: '1941-11-23',
    chambre: '12', etage: 1, admission: '2023-01-09',
    diagnostics: [
      { libelle: 'Arterielle Hypertonie', icd: 'I10' },
      { libelle: 'Beidseitige Gonarthrose', icd: 'M17.0' },
      { libelle: 'Leichte kognitive Störung mit nächtlicher Desorientierung', icd: 'F06.7' },
      { libelle: 'Z. n. wiederholten Stürzen (2 Stürze 2024)', icd: 'Z91.81' },
    ],
    allergies: [{ substance: 'Penicillin', reaction: 'Generalisierte Urtikaria', icd: 'Z88.0' }],
    regime: 'Normale Kost, salzarm.',
    risques: ['Sturz (hohes Risiko)', 'Nächtliche Desorientierung', 'Penicillin-Allergie: kein Antibiotikum aus der Gruppe der Penicilline'],
    medication: [
      { nom: 'Ramipril', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertonie' },
      { nom: 'Amlodipin', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertonie' },
      { nom: 'Paracetamol', dosage: '500 mg', schema: 'bei Schmerzen, max. 3 g/Tag', indication: 'Gelenkschmerzen' },
    ],
    vitaux: [
      { type: 'tension', valeur: '142/86', unite: 'mmHg', minutes: 290 },
      { type: 'pouls', valeur: '88', unite: '/min', minutes: 290 },
      { type: 'temperature', valeur: '37,8', unite: '°C', minutes: 2200 },
      { type: 'poids', valeur: '78,4', unite: 'kg', minutes: 4320 },
    ],
    labo: [{ code: 'CRP', libelle: 'CRP', valeur: 18, unite: 'mg/L', joursAvant: 2 }],
    notes: [
      { minutes: 300, auteur: 'PFK Keller', categorie: 'incident', texte: "Sturz festgestellt um {{h}}: Herr Weber auf dem Weg zur Toilette neben dem Bett am Boden liegend aufgefunden. Kein Bewusstseinsverlust, Schmerzen in der linken Hüfte (VAS 4/10), keine sichtbare Fehlstellung. Blutdruck 142/86, Puls 88. Bereitschaftsarzt benachrichtigt, neurologische Überwachung alle 2 Stunden. Sturzprotokoll angewendet." },
      { minutes: 240, auteur: 'PFK Keller', categorie: 'observation', texte: "Überwachung nach dem Sturz: orientiert, antwortet korrekt, Hüftschmerz stabil (VAS 3/10). Mit Hilfe von zwei Personen in den Stuhl mobilisiert." },
      { minutes: 120, auteur: 'PH Braun', categorie: 'transmission', texte: "Übergabe des nächtlichen Sturzes an das Frühdienstteam. Bett in niedriger Position, Bodenmatte angefordert, Klingel in Reichweite." },
      { minutes: 60, auteur: 'PH Braun', categorie: 'alimentation', texte: "Frühstück zur Hälfte gegessen, hat gut getrunken (250 ml)." },
      { minutes: 2200, auteur: 'PFK Hartmann', categorie: 'observation', texte: "Produktiver Husten seit zwei Tagen, Temperatur 37,8 °C. Hausarzt für eine Konsultation kontaktiert, Brief wird erwartet." },
      { minutes: 7000, auteur: 'PH Braun', categorie: 'observation', texte: "Vorübergehende nächtliche Desorientierung, beruhigt, ohne Schwierigkeiten zurück ins Bett gegangen." },
      { minutes: 20000, auteur: 'PFK Hartmann', categorie: 'transmission', texte: "Teambesprechung: hohes Sturzrisiko, Bodenmatte und Nachtbeleuchtung werden erwogen." },
    ],
  },
  {
    id: 'PAT-004', fhirId: 'aicare-becker', kvnr: 'Z000000014', capteur: 'lora-lit-014',
    civilite: 'Herr', prenom: 'Karl', nom: 'Becker', sexe: 'M', naissance: '1939-01-27',
    chambre: '14', etage: 1, admission: '2022-09-20',
    diagnostics: [
      { libelle: 'Insulinpflichtiger Diabetes mellitus Typ 2', icd: 'E11.7' },
      { libelle: 'Diabetische Neuropathie der Füße', icd: 'E11.4' },
      { libelle: 'Rezidivierende nächtliche Hypoglykämien', icd: 'E16.2' },
    ],
    allergies: [],
    regime: 'Diabetikerkost 1 800 kcal, späte Zwischenmahlzeit vor dem Schlafengehen obligatorisch.',
    risques: ['Nächtliche Hypoglykämie', 'Sturz (Hypoglykämie, Neuropathie)', 'Fußverletzungen'],
    medication: [
      { nom: 'Insulin glargin', dosage: '18 IE', schema: 'abends um 21 Uhr', indication: 'Diabetes mellitus Typ 2', remarque: 'Dosis durch den Diabetologen neu zu bewerten (nächtliche Hypoglykämien).' },
      { nom: 'Insulin lispro', dosage: 'nach Schema', schema: 'vor den Mahlzeiten', indication: 'Diabetes mellitus Typ 2' },
      { nom: 'Metformin', dosage: '500 mg', schema: '1-0-1', indication: 'Diabetes mellitus Typ 2' },
    ],
    vitaux: [
      { type: 'glycemie', valeur: '52', unite: 'mg/dl', minutes: 545 },
      { type: 'glycemie', valeur: '78', unite: 'mg/dl', minutes: 530 },
      { type: 'glycemie', valeur: '96', unite: 'mg/dl', minutes: 480 },
      { type: 'glycemie', valeur: '118', unite: 'mg/dl', minutes: 100 },
      { type: 'tension', valeur: '128/76', unite: 'mmHg', minutes: 100 },
    ],
    labo: [{ code: 'HbA1c', libelle: 'HbA1c', valeur: 8.1, unite: '%', joursAvant: 20 }],
    notes: [
      { minutes: 545, auteur: 'PH Braun', categorie: 'incident', texte: "Nächtliche Hypoglykämie um {{h}}: Blutzucker 52 mg/dl, Schweißausbruch und Zittern. 15 g Glukose verabreicht, Kontrolle nach 15 Minuten: 78 mg/dl, danach Zwischenmahlzeit. Arzt heute Morgen informiert." },
      { minutes: 480, auteur: 'PH Braun', categorie: 'observation', texte: "Blutzucker um {{h}} nachkontrolliert: 96 mg/dl, Symptome verschwunden." },
      { minutes: 100, auteur: 'PFK Keller', categorie: 'observation', texte: "Nüchternblutzucker 118 mg/dl. Vollständiges Frühstück gegessen." },
      { minutes: 1900, auteur: 'PH Braun', categorie: 'incident', texte: "Zweite nächtliche Hypoglykämie in dieser Woche: Blutzucker 58 mg/dl um {{h}}, Glukosegabe erfolgt." },
      { minutes: 3500, auteur: 'PFK Hartmann', categorie: 'transmission', texte: "Dritte nächtliche Hypoglykämie in 5 Tagen. Neubewertung des Basalinsulins beim Diabetologen angefordert." },
      { minutes: 9000, auteur: 'PFK Keller', categorie: 'soins', texte: "Fußinspektion: trockene Haut, keine Wunde, keine Rötung." },
    ],
  },
  {
    id: 'PAT-005', fhirId: 'aicare-wagner', kvnr: 'Z000000020', capteur: 'lora-lit-020',
    civilite: 'Herr', prenom: 'Otto', nom: 'Wagner', sexe: 'M', naissance: '1936-08-05',
    chambre: '20', etage: 2, admission: '2020-11-03',
    diagnostics: [
      { libelle: 'Chronische Niereninsuffizienz Stadium 4', icd: 'N18.4' },
      { libelle: 'Arterielle Hypertonie', icd: 'I10' },
      { libelle: 'Renale Anämie', icd: 'D63.1' },
      { libelle: 'Gicht', icd: 'M10.9' },
    ],
    allergies: [],
    regime: 'Kalium- und phosphatarm, Trinkmengenbeschränkung auf 1 l pro Tag.',
    risques: ['Hyperkaliämie', 'Nephrotoxische Medikamente: nichtsteroidale Antirheumatika (NSAR) kontraindiziert', 'Flüssigkeitsüberlastung'],
    medication: [
      { nom: 'Amlodipin', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertonie' },
      { nom: 'Torasemid', dosage: '10 mg', schema: '1-0-0', indication: 'Diuretikum' },
      { nom: 'Allopurinol', dosage: '100 mg', schema: '1-0-0', indication: 'Gicht (an die Nierenfunktion angepasste Dosis)' },
      { nom: 'Erythropoetin', dosage: '4 000 IE', schema: 'einmal pro Woche', indication: 'Renale Anämie' },
    ],
    vitaux: [
      { type: 'tension', valeur: '148/84', unite: 'mmHg', minutes: 150 },
      { type: 'poids', valeur: '71,2', unite: 'kg', minutes: 150 },
      { type: 'potassium', valeur: '5,1', unite: 'mmol/l', minutes: 1600 },
    ],
    labo: [
      { code: 'eGFR', libelle: 'Geschätzte GFR', valeur: 22, unite: 'ml/min/1,73 m²', joursAvant: 1 },
      { code: 'Creatinine', libelle: 'Kreatinin', valeur: 2.9, unite: 'mg/dl', joursAvant: 1 },
      { code: 'Potassium', libelle: 'Kalium', valeur: 5.1, unite: 'mmol/l', joursAvant: 1 },
    ],
    notes: [
      { minutes: 150, auteur: 'PFK Neumann', categorie: 'observation', texte: "Diurese 900 ml in 24 h, Gewicht 71,2 kg (stabil). Trinkmengenbeschränkung von 1 l eingehalten." },
      { minutes: 500, auteur: 'PH Richter', categorie: 'observation', texte: "Ruhige Nacht. Leichter Juckreiz der Haut (Urämie), beruhigende Creme aufgetragen." },
      { minutes: 1600, auteur: 'PFK Neumann', categorie: 'observation', texte: "Blutbild: Kreatinin 2,9 mg/dl, GFR 22 ml/min, Kalium 5,1 mmol/l. Arzt informiert." },
      { minutes: 5000, auteur: 'PFK Neumann', categorie: 'transmission', texte: "Erinnerung: NSAR (Ibuprofen, Diclofenac) sind kontraindiziert (Niereninsuffizienz Stadium 4), im Pflegeplan vermerkt." },
      { minutes: 15000, auteur: 'PFK Neumann', categorie: 'transmission', texte: "Visite des Nephrologen: konservative Behandlung wird fortgesetzt, Dialyse derzeit nicht indiziert. Rückenschmerzen gemeldet, Hausarzt zu konsultieren." },
    ],
  },
  {
    id: 'PAT-006', fhirId: 'aicare-mueller-2', kvnr: 'Z000000021', capteur: 'lora-lit-021',
    civilite: 'Herr', prenom: 'Heinz', nom: 'Müller', sexe: 'M', naissance: '1947-12-01',
    chambre: '21', etage: 2, admission: '2023-05-22',
    diagnostics: [
      { libelle: 'Diabetes mellitus Typ 2', icd: 'E11.9' },
      { libelle: 'Arterielle Hypertonie', icd: 'I10' },
      { libelle: "Sulfonamid-Allergie", icd: 'Z88.2' },
    ],
    allergies: [{ substance: 'Sulfonamide (einschließlich Cotrimoxazol)', reaction: 'Schwerer Hautausschlag', icd: 'Z88.2' }],
    regime: 'Diabetikerkost 1 900 kcal.',
    risques: ['Sulfonamid-Allergie', 'Harnwegsinfektionen', 'Hyperglykämie'],
    medication: [
      { nom: 'Metformin', dosage: '1000 mg', schema: '1-0-1', indication: 'Diabetes mellitus Typ 2' },
      { nom: 'Candesartan', dosage: '8 mg', schema: '1-0-0', indication: 'Hypertonie' },
    ],
    vitaux: [
      { type: 'glycemie', valeur: '142', unite: 'mg/dl', minutes: 130 },
      { type: 'tension', valeur: '136/82', unite: 'mmHg', minutes: 130 },
      { type: 'temperature', valeur: '37,9', unite: '°C', minutes: 600 },
    ],
    labo: [{ code: 'HbA1c', libelle: 'HbA1c', valeur: 7.2, unite: '%', joursAvant: 25 }],
    notes: [
      { minutes: 130, auteur: 'PFK Neumann', categorie: 'observation', texte: "Nüchternblutzucker 142 mg/dl. Metformin zum Frühstück gegeben." },
      { minutes: 600, auteur: 'PH Richter', categorie: 'observation', texte: "Brennen beim Wasserlassen seit gestern, trüber Urin. Urinteststreifen positiv (Leukozyten), Temperatur 37,9 °C. Hausarzt informiert, Brief wird erwartet." },
      { minutes: 3000, auteur: 'PFK Neumann', categorie: 'transmission', texte: "Sulfonamid-Allergie (Hautausschlag) in der Akte vermerkt und mit der Familie überprüft." },
      { minutes: 9000, auteur: 'PFK Neumann', categorie: 'soins', texte: "Achtung Namensgleichheit: zwei Bewohner namens Heinz Müller im Haus (Zimmer 11 und 21). Immer das Geburtsdatum prüfen: dieser ist am 01.12.1947 geboren." },
    ],
  },
  {
    id: 'PAT-007', fhirId: 'aicare-fischer', kvnr: 'Z000000022', capteur: 'lora-lit-022',
    civilite: 'Frau', prenom: 'Elisabeth', nom: 'Fischer', sexe: 'F', naissance: '1943-04-19',
    chambre: '22', etage: 2, admission: '2022-12-12',
    diagnostics: [
      { libelle: 'Gonarthrose des rechten Knies', icd: 'M17.1' },
      { libelle: 'Osteoporose', icd: 'M81.9' },
      { libelle: 'Hypothyreose', icd: 'E03.9' },
    ],
    allergies: [],
    regime: 'Normale Kost, kalziumreich.',
    risques: ['Fraktur (Osteoporose)', 'Dekubitus (eingeschränkte Mobilität)', 'Knieschmerzen'],
    medication: [
      { nom: 'Levothyroxin', dosage: '75 µg', schema: '1-0-0, nüchtern', indication: 'Hypothyreose' },
      { nom: 'Calcium + Vitamin D3', dosage: '500 mg / 1000 IE', schema: '0-0-1', indication: 'Osteoporose' },
      { nom: 'Paracetamol', dosage: '500 mg', schema: 'bei Schmerzen, max. 3 g/Tag', indication: 'Knieschmerzen' },
    ],
    vitaux: [
      { type: 'tension', valeur: '130/78', unite: 'mmHg', minutes: 100 },
      { type: 'pouls', valeur: '68', unite: '/min', minutes: 100 },
      { type: 'poids', valeur: '59,0', unite: 'kg', minutes: 4000 },
    ],
    labo: [],
    notes: [
      { minutes: 100, auteur: 'PFK Neumann', categorie: 'soins', texte: "Mobilisation mit der Physiotherapeutin, 20 m Gehen mit Rollator." },
      { minutes: 800, auteur: 'PH Richter', categorie: 'soins', texte: "Ruhige Nacht, Lagewechsel alle 3 Stunden (Dekubitusprophylaxe)." },
      { minutes: 2500, auteur: 'PFK Neumann', categorie: 'medication', texte: "Schmerzen im rechten Knie VAS 5/10 am späten Nachmittag, Paracetamol bei Bedarf mit gutem Effekt gegeben." },
      { minutes: 10000, auteur: 'PFK Neumann', categorie: 'transmission', texte: "Orthopädische Konsultation erfolgt, Brief des Facharztes wird erwartet." },
    ],
  },
  {
    id: 'PAT-008', fhirId: 'aicare-hoffmann', kvnr: 'Z000000023', capteur: 'lora-lit-023',
    civilite: 'Frau', prenom: 'Lotte', nom: 'Hoffmann', sexe: 'F', naissance: '1940-10-30',
    chambre: '23', etage: 2, admission: '2021-03-08',
    diagnostics: [
      { libelle: "Alzheimer-Krankheit, mittleres Stadium", icd: 'G30.1' },
      { libelle: 'Dekubitus am Kreuzbein, Stadium 1', icd: 'L89.1' },
      { libelle: 'Mäßige Mangelernährung', icd: 'E44.0' },
    ],
    allergies: [{ substance: 'Latex', reaction: 'Kontakturtikaria', icd: 'Z91.04' }],
    regime: 'Hochkalorische Kost, angepasste Konsistenz, Trinknahrung zweimal täglich.',
    risques: ['Dekubitus', 'Mangelernährung', 'Umherwandern und Unruhe am Abend', 'Latexallergie: latexfreie Handschuhe'],
    medication: [
      { nom: 'Donepezil', dosage: '5 mg', schema: '0-0-1', indication: 'Alzheimer-Krankheit' },
      { nom: 'Vitamin D3', dosage: '1000 IE', schema: '1-0-0', indication: 'Prophylaxe' },
      { nom: 'Hochkalorische Trinknahrung', dosage: '200 ml', schema: '1-0-1', indication: 'Mangelernährung' },
    ],
    vitaux: [
      { type: 'tension', valeur: '118/70', unite: 'mmHg', minutes: 180 },
      { type: 'poids', valeur: '47,8', unite: 'kg', minutes: 7000 },
    ],
    labo: [],
    notes: [
      { minutes: 180, auteur: 'PFK Neumann', categorie: 'soins', texte: "Rötung am Kreuzbein (Stadium 1) stabil, vorbeugender Verband erneuert, Lagewechsel alle 2 Stunden." },
      { minutes: 650, auteur: 'PH Richter', categorie: 'observation', texte: "Unruhe am Abend, Umherwandern im Flur; durch Begleitung und ein warmes Getränk beruhigt. Keine Fixierung." },
      { minutes: 1700, auteur: 'PH Richter', categorie: 'alimentation', texte: "50 % der Mahlzeit gegessen, hochkalorische Trinknahrung angeboten und angenommen." },
      { minutes: 7000, auteur: 'PFK Neumann', categorie: 'transmission', texte: "Wiegen: 47,8 kg (−0,8 kg in 2 Wochen), Diätassistentin informiert." },
    ],
  },
];

// Schlüssel zur Zuordnung zwischen den Systemen (siehe docs/ und Tabelle soins.correspondance).
export function correspondances(r) {
  return [
    ['logiciel_soins', r.id],
    ['fhir', r.fhirId],
    ['epa_kvnr', r.kvnr],
    ['capteur', r.capteur],
    ['chambre', r.chambre],
  ];
}
