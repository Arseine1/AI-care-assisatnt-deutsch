// Connecteur « base de l'hôpital (FHIR) » : ressources FHIR -> texte, un document par résident et par type.
// Le résident est retrouvé par son identifiant FHIR grâce à la table de correspondance (patient_id unique).
const parFhir = {};
for (const { json: r } of $('Correspondance').all()) parFhir[r.fhir_id] = r;

const etiquette = (r) => `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`;
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Berlin' });

const TYPES = {
  Condition: {
    type: 'diagnostic', titre: "Diagnostics (base de l'hôpital FHIR)", intro: 'Diagnostics notés par l\'hôpital',
    ligne: (r) => `- ${r.code?.text ?? 'diagnostic'}${r.code?.coding?.[0]?.code ? ` (CIM-10 ${r.code.coding[0].code})` : ''}, statut ${r.clinicalStatus?.coding?.[0]?.code ?? 'inconnu'}`,
  },
  AllergyIntolerance: {
    type: 'allergie', titre: "Allergies (base de l'hôpital FHIR)", intro: 'Allergies connues de l\'hôpital',
    ligne: (r) => `- ${r.code?.text ?? 'allergie'} : réaction ${r.reaction?.[0]?.description ?? 'non précisée'}`,
  },
  MedicationStatement: {
    type: 'medication', titre: "Médication (base de l'hôpital FHIR)", intro: 'Médication déclarée par l\'hôpital',
    ligne: (r) => `- ${r.medicationCodeableConcept?.text ?? 'médicament'} : ${r.dosage?.[0]?.text ?? 'posologie non précisée'}`,
  },
  Observation: {
    type: 'analyse', titre: "Analyses (base de l'hôpital FHIR)", intro: 'Résultats d\'analyses de l\'hôpital',
    ligne: (r) => `- ${r.code?.text ?? 'analyse'} : ${r.valueQuantity?.value ?? '?'} ${r.valueQuantity?.unit ?? ''} (${jour(r.effectiveDateTime)})`.replace(/ +\(/, ' ('),
  },
};

const groupes = {}; // clé = fhirId|ResourceType
for (const { json: bundle } of $input.all()) {
  for (const e of bundle.entry ?? []) {
    const r = e.resource;
    const def = TYPES[r.resourceType];
    if (!def) continue;
    const fhirId = (r.subject ?? r.patient)?.reference?.replace('Patient/', '');
    if (!parFhir[fhirId]) continue; // patient inconnu de la maison : ignoré
    const cle = `${fhirId}|${r.resourceType}`;
    (groupes[cle] ??= []).push(r);
  }
}

const docs = [];
for (const [cle, ressources] of Object.entries(groupes)) {
  const [fhirId, resourceType] = cle.split('|');
  const def = TYPES[resourceType];
  const patient = parFhir[fhirId];
  const maj = ressources.map((r) => r.meta?.lastUpdated).filter(Boolean).sort().pop();
  docs.push({
    collection: 'patients',
    source: 'fhir',
    source_label: "Base hôpital (FHIR)",
    type: def.type,
    titre: def.titre,
    texte: `${def.intro} pour ${etiquette(patient)} :\n${ressources.map(def.ligne).sort().join('\n')}`,
    source_ref: `${fhirId}/${resourceType}`,
    patient_id: patient.patient_id,
    chambre: patient.chambre,
    patient_label: etiquette(patient),
    date: new Date(maj ?? Date.now()).toISOString(), // _lastUpdated : change seulement si la ressource change
  });
}
return docs.map((json) => ({ json }));
