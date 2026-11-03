// Datenbank des Krankenhauses (FHIR): baut ein Bundle aus data/source/residents.mjs,
// schreibt es nach data/fhir/bundle.json und lädt dann jede Ressource per PUT in HAPI FHIR
// (feste Kennungen => wiederholbar, ohne Duplikate zu erzeugen).
//
// Aufruf: node scripts/charger-fhir.mjs [url]   (Standard: http://localhost:8090/fhir)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { residents } from '../source/residents.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const FHIR = (process.argv[2] || process.env.FHIR_URL_HOTE || 'http://localhost:8090/fhir').replace(/\/$/, '');

const SYSTEME_KVNR = 'http://fhir.de/sid/gkv/kvid-10';
const SYSTEME_LOCAL = 'urn:aicare:logiciel-soins';
const SYSTEME_ICD = 'http://fhir.de/CodeSystem/bfarm/icd-10-gm';

const il_y_a_jours = (j) => new Date(Date.now() - j * 86400000).toISOString();

function ressources(r) {
  const ref = { reference: `Patient/${r.fhirId}` };
  const liste = [];

  liste.push({
    resourceType: 'Patient',
    id: r.fhirId,
    identifier: [
      { system: SYSTEME_KVNR, value: r.kvnr },
      { system: SYSTEME_LOCAL, value: r.id },
    ],
    active: true,
    name: [{ use: 'official', family: r.nom, given: [r.prenom] }],
    gender: r.sexe === 'F' ? 'female' : 'male',
    birthDate: r.naissance,
  });

  r.diagnostics.forEach((d, i) =>
    liste.push({
      resourceType: 'Condition',
      id: `${r.fhirId}-cond-${i + 1}`,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      code: { coding: [{ system: SYSTEME_ICD, code: d.icd }], text: d.libelle },
      subject: ref,
    }),
  );

  r.allergies.forEach((a, i) =>
    liste.push({
      resourceType: 'AllergyIntolerance',
      id: `${r.fhirId}-allergie-${i + 1}`,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
      code: { text: a.substance },
      patient: ref,
      reaction: [{ description: a.reaction }],
    }),
  );

  r.medication.forEach((m, i) =>
    liste.push({
      resourceType: 'MedicationStatement',
      id: `${r.fhirId}-med-${i + 1}`,
      status: 'active',
      medicationCodeableConcept: { text: m.nom },
      subject: ref,
      dosage: [{ text: `${m.dosage}, ${m.schema}` }],
      reasonCode: m.indication ? [{ text: m.indication }] : undefined,
    }),
  );

  r.labo.forEach((l, i) =>
    liste.push({
      resourceType: 'Observation',
      id: `${r.fhirId}-labo-${i + 1}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { text: l.libelle },
      subject: ref,
      effectiveDateTime: il_y_a_jours(l.joursAvant),
      valueQuantity: { value: l.valeur, unit: l.unite },
    }),
  );

  return liste;
}

const entries = residents.flatMap(ressources);
const bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: entries.map((resource) => ({
    fullUrl: `${FHIR}/${resource.resourceType}/${resource.id}`,
    resource,
    request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
  })),
};

mkdirSync(join(racine, 'fhir'), { recursive: true });
writeFileSync(join(racine, 'fhir', 'bundle.json'), JSON.stringify(bundle, null, 2), 'utf8');
console.log(`bundle.json geschrieben: ${entries.length} Ressourcen.`);

try {
  const meta = await fetch(`${FHIR}/metadata`);
  if (!meta.ok) throw new Error(`HTTP ${meta.status}`);
} catch (e) {
  console.error(`HAPI FHIR nicht erreichbar unter ${FHIR} (${e.message}). Starten Sie „docker compose up -d“ in compose/.`);
  process.exit(1);
}

let ok = 0;
for (const { resource } of bundle.entry) {
  const res = await fetch(`${FHIR}/${resource.resourceType}/${resource.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(resource),
  });
  if (!res.ok) {
    console.error(`FEHLER ${resource.resourceType}/${resource.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  ok++;
}
console.log(`HAPI FHIR: ${ok} Ressourcen per PUT geladen.`);
