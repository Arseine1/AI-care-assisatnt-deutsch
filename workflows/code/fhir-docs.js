// Konnektor « Krankenhausdatenbank (FHIR) »: FHIR-Ressourcen -> Text, ein Dokument je Bewohner und Typ.
// Der Bewohner wird über seine FHIR-Kennung anhand der Zuordnungstabelle gefunden (eindeutige patient_id).
const parFhir = {};
for (const { json: r } of $('Zuordnung').all()) parFhir[r.fhir_id] = r;

const etiquette = (r) => `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`;
const jour = (d) => new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

const TYPES = {
  Condition: {
    type: 'diagnostic', titre: 'Diagnosen (Krankenhausdatenbank FHIR)', intro: 'Vom Krankenhaus erfasste Diagnosen',
    ligne: (r) => `- ${r.code?.text ?? 'Diagnose'}${r.code?.coding?.[0]?.code ? ` (ICD-10 ${r.code.coding[0].code})` : ''}, Status ${r.clinicalStatus?.coding?.[0]?.code ?? 'unbekannt'}`,
  },
  AllergyIntolerance: {
    type: 'allergie', titre: 'Allergien (Krankenhausdatenbank FHIR)', intro: 'Dem Krankenhaus bekannte Allergien',
    ligne: (r) => `- ${r.code?.text ?? 'Allergie'}: Reaktion ${r.reaction?.[0]?.description ?? 'nicht angegeben'}`,
  },
  MedicationStatement: {
    type: 'medication', titre: 'Medikation (Krankenhausdatenbank FHIR)', intro: 'Vom Krankenhaus gemeldete Medikation',
    ligne: (r) => `- ${r.medicationCodeableConcept?.text ?? 'Medikament'}: ${r.dosage?.[0]?.text ?? 'Dosierung nicht angegeben'}`,
  },
  Observation: {
    type: 'analyse', titre: 'Laborwerte (Krankenhausdatenbank FHIR)', intro: 'Laborergebnisse des Krankenhauses',
    ligne: (r) => `- ${r.code?.text ?? 'Laborwert'}: ${r.valueQuantity?.value ?? '?'} ${r.valueQuantity?.unit ?? ''} (${jour(r.effectiveDateTime)})`.replace(/ +\(/, ' ('),
  },
};

const groupes = {}; // Schlüssel = fhirId|ResourceType
for (const { json: bundle } of $input.all()) {
  for (const e of bundle.entry ?? []) {
    const r = e.resource;
    const def = TYPES[r.resourceType];
    if (!def) continue;
    const fhirId = (r.subject ?? r.patient)?.reference?.replace('Patient/', '');
    if (!parFhir[fhirId]) continue; // der Einrichtung unbekannter Patient: ignoriert
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
    source_label: 'Krankenhausdatenbank (FHIR)',
    type: def.type,
    titre: def.titre,
    texte: `${def.intro} für ${etiquette(patient)}:\n${ressources.map(def.ligne).sort().join('\n')}`,
    source_ref: `${fhirId}/${resourceType}`,
    patient_id: patient.patient_id,
    chambre: patient.chambre,
    patient_label: etiquette(patient),
    date: new Date(maj ?? Date.now()).toISOString(), // _lastUpdated: ändert sich nur, wenn sich die Ressource ändert
  });
}
return docs.map((json) => ({ json }));
