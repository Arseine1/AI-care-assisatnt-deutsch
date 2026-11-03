// Connecteur « ePA » (mocks gematik, accès direct sans VAU) : diagnostics et liste de médication (eML) en FHIR JSON.
// On lit le FHIR plutôt que le rendu XHTML : l'encodage des accents y est correct.
// Le mock ne sait pas chercher par patient : on lit tout puis on filtre sur le KVNR (voir epa-docs.js).
const BASE = 'http://host.docker.internal:8084/fhir';
return [
  { json: { type: 'Condition', url: `${BASE}/Condition?_count=500` } },
  { json: { type: 'MedicationRequest', url: `${BASE}/MedicationRequest?_count=500&_include=MedicationRequest:medication` } },
];
