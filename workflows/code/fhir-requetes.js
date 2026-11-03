// Connecteur « base de l'hôpital (FHIR) » : une requête par type de ressource.
// _lastUpdated sert de date aux documents (voir fhir-docs.js) ; on relit toujours la liste complète
// d'un type pour reconstruire le document entier d'un résident (jamais un morceau partiel).
const BASE = 'http://hapi-fhir:8080/fhir';
const types = ['Condition', 'AllergyIntolerance', 'MedicationStatement', 'Observation'];
return types.map((type) => ({ json: { type, url: `${BASE}/${type}?_count=500&_sort=_lastUpdated` } }));
