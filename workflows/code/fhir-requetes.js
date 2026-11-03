// Konnektor « Krankenhausdatenbank (FHIR) »: eine Abfrage je Ressourcentyp.
// _lastUpdated dient als Datum der Dokumente (siehe fhir-docs.js); die vollständige Liste eines Typs wird immer neu gelesen,
// um das gesamte Dokument eines Bewohners neu aufzubauen (nie nur ein Teilstück).
const BASE = 'http://hapi-fhir:8080/fhir';
const types = ['Condition', 'AllergyIntolerance', 'MedicationStatement', 'Observation'];
return types.map((type) => ({ json: { type, url: `${BASE}/${type}?_count=500&_sort=_lastUpdated` } }));
