// Test-ePA: lädt die Medikationsliste (eML) und die Diagnosen der 8 fiktiven Bewohner
// in den „medication-service“ der gematik-Mocks (HAPI FHIR, Port 8084), zusätzlich zu den gematik-Beispielen.
// PUT mit festen Kennungen => wiederholbar ohne Duplikate.
//
// Besonderheit des Mocks: Der Dienst kann nicht nach Patient suchen (bekannte Einschränkung von HAPI bei
// logischen Referenzen). Die Verbraucher (n8n-Workflow ePA) lesen daher die Liste und filtern dann nach
// subject.identifier (= KVNR des Bewohners).
//
// Aufruf: node scripts/charger-epa.mjs [url]   (Standard: http://localhost:8084/fhir)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { residents } from '../source/residents.mjs';

const FHIR = (process.argv[2] || 'http://localhost:8084/fhir').replace(/\/$/, '');
const KVNR = 'http://fhir.de/sid/gkv/kvid-10';
const jours = (j) => new Date(Date.now() - j * 86400000).toISOString();

// Gemeinsamer fiktiver Verordner: Der Rendering-Dienst verlangt einen „requester“ (PractitionerRole -> Practitioner + Organization).
const ressources = [
  {
    resourceType: 'Organization',
    id: 'epa-org-berger',
    active: true,
    name: 'Hausarztpraxis Dr. Berger (fictif)',
    identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: '2-2.99.00000001' }],
  },
  {
    resourceType: 'Practitioner',
    id: 'epa-prac-berger',
    active: true,
    identifier: [{ system: 'https://gematik.de/fhir/sid/telematik-id', value: '1-1.99.00000001' }],
    name: [{ family: 'Berger', given: ['Annika'], prefix: ['Dr. med.'], text: 'Dr. med. Annika Berger' }],
  },
  {
    resourceType: 'PractitionerRole',
    id: 'epa-role-berger',
    active: true,
    practitioner: { reference: 'Practitioner/epa-prac-berger' },
    organization: { reference: 'Organization/epa-org-berger' },
    code: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0286', code: 'RP' }] }],
  },
];
for (const r of residents) {
  const sujet = { identifier: { system: KVNR, value: r.kvnr } };
  ressources.push({
    resourceType: 'Patient',
    id: `epa-${r.fhirId}`,
    identifier: [{ system: KVNR, value: r.kvnr }],
    name: [{ family: r.nom, given: [r.prenom] }],
    birthDate: r.naissance,
  });
  r.medication.forEach((m, i) => {
    const idMed = `epa-med-${r.id}-${i + 1}`;
    ressources.push({
      resourceType: 'Medication',
      id: idMed,
      status: 'active',
      code: { coding: [{ system: 'http://fhir.de/CodeSystem/ask', display: m.nom }], text: m.nom },
    });
    ressources.push({
      resourceType: 'MedicationRequest',
      id: `epa-mr-${r.id}-${i + 1}`,
      status: 'active',
      intent: 'order',
      medicationReference: { reference: `Medication/${idMed}` },
      authoredOn: jours(30 + i * 7),
      subject: sujet,
      requester: { reference: 'PractitionerRole/epa-role-berger' },
      dosageInstruction: [{ text: `${m.dosage}, ${m.schema}` }],
      note: m.remarque ? [{ text: m.remarque }] : undefined,
    });
  });
  r.diagnostics.forEach((d, i) =>
    ressources.push({
      resourceType: 'Condition',
      id: `epa-cond-${r.id}-${i + 1}`,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      code: { coding: [{ system: 'http://fhir.de/CodeSystem/bfarm/icd-10-gm', code: d.icd }], text: d.libelle },
      subject: sujet,
    }),
  );
}

try {
  const m = await fetch(`${FHIR}/metadata`);
  if (!m.ok) throw new Error(`HTTP ${m.status}`);
} catch (e) {
  console.error(`medication-service nicht erreichbar unter ${FHIR} (${e.message}). Starten Sie die ePA-Mocks (siehe README).`);
  process.exit(1);
}

// gematik-Beispiele (Transaktion): nur einmal geladen, da eine POST-Transaktion nicht idempotent ist.
const exemple = await (await fetch(`${FHIR}/Patient?identifier=Z123456783&_summary=count`)).json();
if (exemple.total === 0) {
  const chemin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'compose', 'epa-deployment', 'medication', 'samples', 'transaction.json');
  if (existsSync(chemin)) {
    const rep = await fetch(FHIR, { method: 'POST', headers: { 'Content-Type': 'application/fhir+json' }, body: readFileSync(chemin, 'utf8') });
    console.log(rep.ok ? 'gematik-Beispiele geladen (Patient Z123456783).' : `gematik-Beispiele: Fehler HTTP ${rep.status}`);
  }
}

let ok = 0;
for (const res of ressources) {
  const rep = await fetch(`${FHIR}/${res.resourceType}/${res.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(res),
  });
  if (!rep.ok) {
    console.error(`FEHLER ${res.resourceType}/${res.id}: HTTP ${rep.status} ${(await rep.text()).slice(0, 300)}`);
    process.exit(1);
  }
  ok++;
}
console.log(`Test-ePA: ${ok} Ressourcen geladen (eML + Diagnosen der ${residents.length} Bewohner).`);
