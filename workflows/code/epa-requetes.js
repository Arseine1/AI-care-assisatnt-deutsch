// ePA-Konnektor (gematik-Mocks, Direktzugriff ohne VAU): Diagnosen und Medikationsliste (eML) als FHIR-JSON.
// Es wird das FHIR gelesen statt der XHTML-Darstellung: Die Kodierung der Sonderzeichen ist dort korrekt.
// Der Mock kann nicht nach Patient suchen: Es wird alles gelesen und dann nach KVNR gefiltert (siehe epa-docs.js).
const BASE = 'http://host.docker.internal:8084/fhir';
return [
  { json: { type: 'Condition', url: `${BASE}/Condition?_count=500` } },
  { json: { type: 'MedicationRequest', url: `${BASE}/MedicationRequest?_count=500&_include=MedicationRequest:medication` } },
];
