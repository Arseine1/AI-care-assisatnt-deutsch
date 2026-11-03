// SOURCE UNIQUE des données de test (100 % fictives).
// Tout le reste (SQL, bundle FHIR, front) est généré à partir de ce fichier,
// pour que les mêmes résidents apparaissent partout avec les mêmes informations.
//
// Horodatages : `minutes` = « il y a N minutes » par rapport au moment du chargement.
// Dans un texte, {{h}} = heure de la note elle-même, {{h:N}} = heure d'il y a N minutes.

export const MAISON = { nom: 'Haus Sonnenhof', kim: 'pflegeheim-sonnenhof@kim.example.test' };

export const residents = [
  {
    id: 'PAT-001', fhirId: 'aicare-schulz', kvnr: 'Z000000010', capteur: 'lora-lit-010',
    civilite: 'Mme', prenom: 'Greta', nom: 'Schulz', sexe: 'F', naissance: '1938-03-14',
    chambre: '10', etage: 1, admission: '2022-02-01',
    diagnostics: [
      { libelle: 'Fibrillation auriculaire permanente', icd: 'I48.2' },
      { libelle: "Antécédent d'embolie pulmonaire", icd: 'Z86.7' },
      { libelle: 'Hypertension artérielle', icd: 'I10' },
      { libelle: 'Anticoagulation au long cours (Marcumar)', icd: 'Z79.01' },
    ],
    allergies: [],
    regime: 'Alimentation normale avec apport régulier en vitamine K (légumes verts en quantité constante, à cause du Marcumar).',
    risques: ['Saignement (anticoagulant)', 'Chute avec traumatisme crânien', 'Interactions médicamenteuses'],
    medication: [
      { nom: 'Marcumar (phenprocoumon)', dosage: '3 mg', schema: 'le soir, selon INR (cible 2,0–3,0)', indication: 'Fibrillation auriculaire / prévention embolique', remarque: 'Contrôle INR chaque semaine. Anticoagulant : ne jamais associer un second anticoagulant sans avis médical.' },
      { nom: 'Bisoprolol', dosage: '2,5 mg', schema: '1-0-0', indication: 'Fréquence cardiaque' },
      { nom: 'Ramipril', dosage: '2,5 mg', schema: '1-0-0', indication: 'Hypertension' },
    ],
    vitaux: [
      { type: 'tension', valeur: '134/80', unite: 'mmHg', minutes: 180 },
      { type: 'pouls', valeur: '72', unite: '/min (irrégulier)', minutes: 180 },
      { type: 'inr', valeur: '2,6', unite: '', minutes: 1500 },
    ],
    labo: [{ code: 'INR', libelle: 'INR', valeur: 2.6, unite: '', joursAvant: 1 }],
    notes: [
      { minutes: 80, auteur: 'IDE Keller', categorie: 'medication', texte: "Marcumar 3 mg donné à 18h selon le schéma. Aucun saignement visible des gencives, pas de nouvel hématome." },
      { minutes: 400, auteur: 'AS Braun', categorie: 'observation', texte: "Nuit calme, sommeil continu. Peau intacte, ancien hématome du bras droit en régression." },
      { minutes: 1500, auteur: 'IDE Keller', categorie: 'medication', texte: "INR du jour : 2,6 (cible 2,0–3,0). Dose de Marcumar inchangée sur avis du médecin traitant." },
      { minutes: 4000, auteur: 'IDE Hartmann', categorie: 'transmission', texte: "Rappel à l'équipe : le Marcumar est un anticoagulant à surveiller ; aucune autre molécule anticoagulante sans accord du médecin." },
      { minutes: 12000, auteur: 'IDE Keller', categorie: 'transmission', texte: "Rendez-vous de cardiologie prévu cette semaine, courrier du cardiologue attendu." },
    ],
  },
  {
    id: 'PAT-002', fhirId: 'aicare-mueller-1', kvnr: 'Z000000011', capteur: 'lora-lit-011',
    civilite: 'M.', prenom: 'Heinz', nom: 'Müller', sexe: 'M', naissance: '1934-05-09',
    chambre: '11', etage: 1, admission: '2021-06-15',
    diagnostics: [
      { libelle: 'BPCO, stade GOLD 3', icd: 'J44.1' },
      { libelle: 'Insuffisance cardiaque chronique, NYHA II', icd: 'I50.9' },
    ],
    allergies: [],
    regime: 'Pauvre en sel, restriction hydrique à 1,5 L par jour.',
    risques: ['Dyspnée nocturne', 'Décompensation cardiaque', 'Chute'],
    medication: [
      { nom: 'Furosémide', dosage: '40 mg', schema: '1-0-0', indication: 'Insuffisance cardiaque' },
      { nom: 'Tiotropium', dosage: '18 µg', schema: '1-0-0 (inhalation)', indication: 'BPCO' },
      { nom: 'Salbutamol', dosage: '100 µg', schema: 'si dyspnée, 2 bouffées', indication: 'BPCO' },
      { nom: 'Ramipril', dosage: '5 mg', schema: '1-0-0', indication: 'Insuffisance cardiaque' },
    ],
    vitaux: [
      { type: 'spo2', valeur: '92', unite: '%', minutes: 200 },
      { type: 'tension', valeur: '126/72', unite: 'mmHg', minutes: 200 },
      { type: 'poids', valeur: '82,5', unite: 'kg', minutes: 2000 },
    ],
    labo: [],
    notes: [
      { minutes: 200, auteur: 'IDE Hartmann', categorie: 'observation', texte: "Dyspnée modérée à l'effort, SpO2 92 % à l'air ambiant. Salbutamol 2 bouffées avec bon effet." },
      { minutes: 700, auteur: 'AS Braun', categorie: 'observation', texte: "Nuit : toux, installé en position semi-assise, SpO2 93 %." },
      { minutes: 2000, auteur: 'IDE Keller', categorie: 'observation', texte: "Poids 82,5 kg (+1,2 kg en 3 jours), chevilles légèrement œdématiées. Médecin informé." },
      { minutes: 6000, auteur: 'IDE Hartmann', categorie: 'soins', texte: "Kinésithérapie respiratoire réalisée, bonne participation." },
    ],
  },
  {
    id: 'PAT-003', fhirId: 'aicare-weber', kvnr: 'Z000000012', capteur: 'lora-lit-012',
    civilite: 'M.', prenom: 'Hans', nom: 'Weber', sexe: 'M', naissance: '1941-11-23',
    chambre: '12', etage: 1, admission: '2023-01-09',
    diagnostics: [
      { libelle: 'Hypertension artérielle', icd: 'I10' },
      { libelle: 'Gonarthrose bilatérale', icd: 'M17.0' },
      { libelle: 'Trouble cognitif léger avec désorientation nocturne', icd: 'F06.7' },
      { libelle: 'Antécédent de chutes à répétition (2 chutes en 2024)', icd: 'Z91.81' },
    ],
    allergies: [{ substance: 'Pénicilline', reaction: 'Urticaire généralisée', icd: 'Z88.0' }],
    regime: 'Alimentation normale, pauvre en sel.',
    risques: ['Chute (risque élevé)', 'Désorientation nocturne', 'Allergie à la pénicilline : aucun antibiotique de la famille des pénicillines'],
    medication: [
      { nom: 'Ramipril', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertension' },
      { nom: 'Amlodipine', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertension' },
      { nom: 'Paracétamol', dosage: '500 mg', schema: 'si douleur, max 3 g/jour', indication: 'Douleurs articulaires' },
    ],
    vitaux: [
      { type: 'tension', valeur: '142/86', unite: 'mmHg', minutes: 290 },
      { type: 'pouls', valeur: '88', unite: '/min', minutes: 290 },
      { type: 'temperature', valeur: '37,8', unite: '°C', minutes: 2200 },
      { type: 'poids', valeur: '78,4', unite: 'kg', minutes: 4320 },
    ],
    labo: [{ code: 'CRP', libelle: 'CRP', valeur: 18, unite: 'mg/L', joursAvant: 2 }],
    notes: [
      { minutes: 300, auteur: 'IDE Keller', categorie: 'incident', texte: "Chute constatée à {{h}} : M. Weber retrouvé au sol à côté du lit en allant aux toilettes. Pas de perte de connaissance, douleur à la hanche gauche (EVA 4/10), pas de déformation visible. Tension 142/86, pouls 88. Médecin d'astreinte prévenu, surveillance neurologique toutes les 2 heures. Protocole de chute appliqué." },
      { minutes: 240, auteur: 'IDE Keller', categorie: 'observation', texte: "Surveillance après la chute : orienté, répond correctement, douleur de la hanche stable (EVA 3/10). Mobilisé au fauteuil avec l'aide de deux personnes." },
      { minutes: 120, auteur: 'AS Braun', categorie: 'transmission', texte: "Transmission de la chute de cette nuit à l'équipe du matin. Lit en position basse, tapis de sol demandé, sonnette à portée de main." },
      { minutes: 60, auteur: 'AS Braun', categorie: 'alimentation', texte: "Petit-déjeuner pris à moitié, a bien bu (250 ml)." },
      { minutes: 2200, auteur: 'IDE Hartmann', categorie: 'observation', texte: "Toux grasse depuis deux jours, température 37,8 °C. Médecin traitant contacté pour une consultation, courrier attendu." },
      { minutes: 7000, auteur: 'AS Braun', categorie: 'observation', texte: "Désorientation nocturne passagère, rassuré, retour au lit sans difficulté." },
      { minutes: 20000, auteur: 'IDE Hartmann', categorie: 'transmission', texte: "Réunion d'équipe : risque de chute élevé, tapis de sol et éclairage de nuit envisagés." },
    ],
  },
  {
    id: 'PAT-004', fhirId: 'aicare-becker', kvnr: 'Z000000014', capteur: 'lora-lit-014',
    civilite: 'M.', prenom: 'Karl', nom: 'Becker', sexe: 'M', naissance: '1939-01-27',
    chambre: '14', etage: 1, admission: '2022-09-20',
    diagnostics: [
      { libelle: 'Diabète de type 2 insulino-traité', icd: 'E11.7' },
      { libelle: 'Neuropathie diabétique des pieds', icd: 'E11.4' },
      { libelle: 'Hypoglycémies nocturnes récidivantes', icd: 'E16.2' },
    ],
    allergies: [],
    regime: 'Régime diabétique 1 800 kcal, collation tardive obligatoire au coucher.',
    risques: ['Hypoglycémie nocturne', 'Chute (hypoglycémie, neuropathie)', 'Lésions du pied'],
    medication: [
      { nom: 'Insuline glargine', dosage: '18 UI', schema: 'le soir à 21h', indication: 'Diabète de type 2', remarque: 'Dose à réévaluer par le diabétologue (hypoglycémies nocturnes).' },
      { nom: 'Insuline lispro', dosage: 'selon schéma', schema: 'avant les repas', indication: 'Diabète de type 2' },
      { nom: 'Metformine', dosage: '500 mg', schema: '1-0-1', indication: 'Diabète de type 2' },
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
      { minutes: 545, auteur: 'AS Braun', categorie: 'incident', texte: "Hypoglycémie nocturne à {{h}} : glycémie 52 mg/dl, sueurs et tremblements. 15 g de glucose administrés, recontrôle à 15 minutes : 78 mg/dl, puis collation. Médecin informé ce matin." },
      { minutes: 480, auteur: 'AS Braun', categorie: 'observation', texte: "Glycémie recontrôlée à {{h}} : 96 mg/dl, symptômes disparus." },
      { minutes: 100, auteur: 'IDE Keller', categorie: 'observation', texte: "Glycémie à jeun 118 mg/dl. Petit-déjeuner complet pris." },
      { minutes: 1900, auteur: 'AS Braun', categorie: 'incident', texte: "Deuxième hypoglycémie nocturne cette semaine : glycémie 58 mg/dl à {{h}}, resucrage effectué." },
      { minutes: 3500, auteur: 'IDE Hartmann', categorie: 'transmission', texte: "Troisième hypoglycémie nocturne en 5 jours. Réévaluation de l'insuline basale demandée au diabétologue." },
      { minutes: 9000, auteur: 'IDE Keller', categorie: 'soins', texte: "Examen des pieds : peau sèche, pas de plaie ni de rougeur." },
    ],
  },
  {
    id: 'PAT-005', fhirId: 'aicare-wagner', kvnr: 'Z000000020', capteur: 'lora-lit-020',
    civilite: 'M.', prenom: 'Otto', nom: 'Wagner', sexe: 'M', naissance: '1936-08-05',
    chambre: '20', etage: 2, admission: '2020-11-03',
    diagnostics: [
      { libelle: 'Insuffisance rénale chronique stade 4', icd: 'N18.4' },
      { libelle: 'Hypertension artérielle', icd: 'I10' },
      { libelle: 'Anémie rénale', icd: 'D63.1' },
      { libelle: 'Goutte', icd: 'M10.9' },
    ],
    allergies: [],
    regime: 'Pauvre en potassium et en phosphate, restriction hydrique à 1 L par jour.',
    risques: ['Hyperkaliémie', 'Médicaments néphrotoxiques : anti-inflammatoires non stéroïdiens (AINS) contre-indiqués', 'Surcharge hydrique'],
    medication: [
      { nom: 'Amlodipine', dosage: '5 mg', schema: '1-0-0', indication: 'Hypertension' },
      { nom: 'Torasémide', dosage: '10 mg', schema: '1-0-0', indication: 'Diurétique' },
      { nom: 'Allopurinol', dosage: '100 mg', schema: '1-0-0', indication: 'Goutte (dose adaptée à la fonction rénale)' },
      { nom: 'Érythropoïétine', dosage: '4 000 UI', schema: 'une fois par semaine', indication: 'Anémie rénale' },
    ],
    vitaux: [
      { type: 'tension', valeur: '148/84', unite: 'mmHg', minutes: 150 },
      { type: 'poids', valeur: '71,2', unite: 'kg', minutes: 150 },
      { type: 'potassium', valeur: '5,1', unite: 'mmol/l', minutes: 1600 },
    ],
    labo: [
      { code: 'eGFR', libelle: 'DFG estimé', valeur: 22, unite: 'ml/min/1,73 m²', joursAvant: 1 },
      { code: 'Creatinine', libelle: 'Créatinine', valeur: 2.9, unite: 'mg/dl', joursAvant: 1 },
      { code: 'Potassium', libelle: 'Potassium', valeur: 5.1, unite: 'mmol/l', joursAvant: 1 },
    ],
    notes: [
      { minutes: 150, auteur: 'IDE Neumann', categorie: 'observation', texte: "Diurèse 900 ml sur 24 h, poids 71,2 kg (stable). Restriction hydrique de 1 L respectée." },
      { minutes: 500, auteur: 'AS Richter', categorie: 'observation', texte: "Nuit calme. Démangeaisons cutanées légères (urémie), crème apaisante appliquée." },
      { minutes: 1600, auteur: 'IDE Neumann', categorie: 'observation', texte: "Bilan sanguin : créatinine 2,9 mg/dl, DFG 22 ml/min, potassium 5,1 mmol/l. Médecin informé." },
      { minutes: 5000, auteur: 'IDE Neumann', categorie: 'transmission', texte: "Rappel : les AINS (ibuprofène, diclofénac) sont contre-indiqués (insuffisance rénale stade 4), mentionné dans le plan de soins." },
      { minutes: 15000, auteur: 'IDE Neumann', categorie: 'transmission', texte: "Visite du néphrologue : poursuite du traitement conservateur, dialyse non indiquée pour l'instant. Douleurs du dos signalées, médecin traitant à consulter." },
    ],
  },
  {
    id: 'PAT-006', fhirId: 'aicare-mueller-2', kvnr: 'Z000000021', capteur: 'lora-lit-021',
    civilite: 'M.', prenom: 'Heinz', nom: 'Müller', sexe: 'M', naissance: '1947-12-01',
    chambre: '21', etage: 2, admission: '2023-05-22',
    diagnostics: [
      { libelle: 'Diabète de type 2', icd: 'E11.9' },
      { libelle: 'Hypertension artérielle', icd: 'I10' },
      { libelle: "Allergie aux sulfamides", icd: 'Z88.2' },
    ],
    allergies: [{ substance: 'Sulfamides (sulfonamides, dont le cotrimoxazole)', reaction: 'Éruption cutanée sévère', icd: 'Z88.2' }],
    regime: 'Régime diabétique 1 900 kcal.',
    risques: ['Allergie aux sulfamides', 'Infections urinaires', 'Hyperglycémie'],
    medication: [
      { nom: 'Metformine', dosage: '1000 mg', schema: '1-0-1', indication: 'Diabète de type 2' },
      { nom: 'Candésartan', dosage: '8 mg', schema: '1-0-0', indication: 'Hypertension' },
    ],
    vitaux: [
      { type: 'glycemie', valeur: '142', unite: 'mg/dl', minutes: 130 },
      { type: 'tension', valeur: '136/82', unite: 'mmHg', minutes: 130 },
      { type: 'temperature', valeur: '37,9', unite: '°C', minutes: 600 },
    ],
    labo: [{ code: 'HbA1c', libelle: 'HbA1c', valeur: 7.2, unite: '%', joursAvant: 25 }],
    notes: [
      { minutes: 130, auteur: 'IDE Neumann', categorie: 'observation', texte: "Glycémie à jeun 142 mg/dl. Metformine donnée au petit-déjeuner." },
      { minutes: 600, auteur: 'AS Richter', categorie: 'observation', texte: "Brûlures en urinant depuis hier, urine trouble. Bandelette urinaire positive (leucocytes), température 37,9 °C. Médecin traitant informé, courrier attendu." },
      { minutes: 3000, auteur: 'IDE Neumann', categorie: 'transmission', texte: "Allergie aux sulfamides (éruption cutanée) rappelée dans le dossier et vérifiée avec la famille." },
      { minutes: 9000, auteur: 'IDE Neumann', categorie: 'soins', texte: "Attention aux homonymes : deux résidents nommés Heinz Müller dans la maison (chambres 11 et 21). Toujours vérifier la date de naissance : celui-ci est né le 01.12.1947." },
    ],
  },
  {
    id: 'PAT-007', fhirId: 'aicare-fischer', kvnr: 'Z000000022', capteur: 'lora-lit-022',
    civilite: 'Mme', prenom: 'Elisabeth', nom: 'Fischer', sexe: 'F', naissance: '1943-04-19',
    chambre: '22', etage: 2, admission: '2022-12-12',
    diagnostics: [
      { libelle: 'Gonarthrose du genou droit', icd: 'M17.1' },
      { libelle: 'Ostéoporose', icd: 'M81.9' },
      { libelle: 'Hypothyroïdie', icd: 'E03.9' },
    ],
    allergies: [],
    regime: 'Alimentation normale, riche en calcium.',
    risques: ['Fracture (ostéoporose)', 'Escarre (mobilité réduite)', 'Douleur du genou'],
    medication: [
      { nom: 'Lévothyroxine', dosage: '75 µg', schema: '1-0-0, à jeun', indication: 'Hypothyroïdie' },
      { nom: 'Calcium + vitamine D3', dosage: '500 mg / 1000 UI', schema: '0-0-1', indication: 'Ostéoporose' },
      { nom: 'Paracétamol', dosage: '500 mg', schema: 'si douleur, max 3 g/jour', indication: 'Douleur du genou' },
    ],
    vitaux: [
      { type: 'tension', valeur: '130/78', unite: 'mmHg', minutes: 100 },
      { type: 'pouls', valeur: '68', unite: '/min', minutes: 100 },
      { type: 'poids', valeur: '59,0', unite: 'kg', minutes: 4000 },
    ],
    labo: [],
    notes: [
      { minutes: 100, auteur: 'IDE Neumann', categorie: 'soins', texte: "Mobilisation avec la kinésithérapeute, marche de 20 m avec déambulateur." },
      { minutes: 800, auteur: 'AS Richter', categorie: 'soins', texte: "Nuit calme, changements de position toutes les 3 heures (prévention des escarres)." },
      { minutes: 2500, auteur: 'IDE Neumann', categorie: 'medication', texte: "Douleur du genou droit EVA 5/10 en fin de journée, paracétamol à la demande donné avec bon effet." },
      { minutes: 10000, auteur: 'IDE Neumann', categorie: 'transmission', texte: "Consultation orthopédique effectuée, courrier du spécialiste attendu." },
    ],
  },
  {
    id: 'PAT-008', fhirId: 'aicare-hoffmann', kvnr: 'Z000000023', capteur: 'lora-lit-023',
    civilite: 'Mme', prenom: 'Lotte', nom: 'Hoffmann', sexe: 'F', naissance: '1940-10-30',
    chambre: '23', etage: 2, admission: '2021-03-08',
    diagnostics: [
      { libelle: "Maladie d'Alzheimer, stade modéré", icd: 'G30.1' },
      { libelle: 'Escarre du sacrum, stade 1', icd: 'L89.1' },
      { libelle: 'Dénutrition modérée', icd: 'E44.0' },
    ],
    allergies: [{ substance: 'Latex', reaction: 'Urticaire de contact', icd: 'Z91.04' }],
    regime: 'Alimentation hypercalorique, texture adaptée, compléments nutritionnels deux fois par jour.',
    risques: ['Escarre', 'Dénutrition', 'Errance et agitation vespérale', 'Allergie au latex : gants sans latex'],
    medication: [
      { nom: 'Donépézil', dosage: '5 mg', schema: '0-0-1', indication: 'Maladie d\'Alzheimer' },
      { nom: 'Vitamine D3', dosage: '1000 UI', schema: '1-0-0', indication: 'Prévention' },
      { nom: 'Complément nutritionnel hypercalorique', dosage: '200 ml', schema: '1-0-1', indication: 'Dénutrition' },
    ],
    vitaux: [
      { type: 'tension', valeur: '118/70', unite: 'mmHg', minutes: 180 },
      { type: 'poids', valeur: '47,8', unite: 'kg', minutes: 7000 },
    ],
    labo: [],
    notes: [
      { minutes: 180, auteur: 'IDE Neumann', categorie: 'soins', texte: "Rougeur du sacrum (stade 1) stable, pansement préventif renouvelé, changement de position toutes les 2 heures." },
      { minutes: 650, auteur: 'AS Richter', categorie: 'observation', texte: "Agitation en soirée, errance dans le couloir ; calmée par un accompagnement et une boisson chaude. Pas de contention." },
      { minutes: 1700, auteur: 'AS Richter', categorie: 'alimentation', texte: "A mangé 50 % du repas, complément hypercalorique proposé et accepté." },
      { minutes: 7000, auteur: 'IDE Neumann', categorie: 'transmission', texte: "Pesée : 47,8 kg (−0,8 kg en 2 semaines), diététicienne informée." },
    ],
  },
];

// Clé de rapprochement entre systèmes (voir docs/ et table soins.correspondance).
export function correspondances(r) {
  return [
    ['logiciel_soins', r.id],
    ['fhir', r.fhirId],
    ['epa_kvnr', r.kvnr],
    ['capteur', r.capteur],
    ['chambre', r.chambre],
  ];
}
