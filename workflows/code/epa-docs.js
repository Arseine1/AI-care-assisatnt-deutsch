// ePA-Konnektor: Diagnosen und eML -> Text, ein Dokument je Bewohner und Typ, Quelle « ePA ».
// Die Patienten der gematik-Beispiele (der Einrichtung unbekannte KVNR) werden ignoriert.
const parKvnr = {};
for (const { json: r } of $('Zuordnung').all()) parKvnr[r.kvnr] = r;

const etiquette = (r) => `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`;
const jour = (d) => new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
const kvnrDe = (r) => r.subject?.identifier?.value;

const conditions = [];
const ordonnances = [];
const medicaments = {};
for (const { json: bundle } of $input.all()) {
  for (const e of bundle.entry ?? []) {
    const r = e.resource;
    if (r.resourceType === 'Condition') conditions.push(r);
    else if (r.resourceType === 'MedicationRequest') ordonnances.push(r);
    else if (r.resourceType === 'Medication') medicaments[`Medication/${r.id}`] = r;
  }
}

const parPatient = {};
const range = (kvnr) => (parPatient[kvnr] ??= { diag: [], med: [] });
for (const c of conditions) if (parKvnr[kvnrDe(c)]) range(kvnrDe(c)).diag.push(c);
for (const o of ordonnances) if (parKvnr[kvnrDe(o)]) range(kvnrDe(o)).med.push(o);

const docs = [];
for (const [kvnr, { diag, med }] of Object.entries(parPatient)) {
  const p = parKvnr[kvnr];
  const commun = {
    collection: 'patients',
    source: 'epa',
    source_label: 'ePA',
    patient_id: p.patient_id,
    chambre: p.chambre,
    patient_label: etiquette(p),
  };

  if (diag.length) {
    const maj = diag.map((c) => c.meta?.lastUpdated).filter(Boolean).sort().pop();
    docs.push({
      ...commun,
      type: 'diagnostic',
      titre: 'Diagnosen (ePA)',
      texte: `Diagnosen aus der ePA-Akte von ${etiquette(p)}:\n${diag
        .map((c) => `- ${c.code?.text ?? 'Diagnose'}${c.code?.coding?.[0]?.code ? ` (ICD-10 ${c.code.coding[0].code})` : ''}`)
        .sort()
        .join('\n')}`,
      source_ref: `epa/${kvnr}/diagnostics`,
      date: new Date(maj ?? Date.now()).toISOString(),
    });
  }

  if (med.length) {
    const lignes = med.map((o) => {
      const m = medicaments[o.medicationReference?.reference];
      const nom = m?.code?.text ?? m?.code?.coding?.[0]?.display ?? 'Medikament';
      const dose = o.dosageInstruction?.[0]?.text ?? 'Dosierung nicht angegeben';
      const note = o.note?.[0]?.text ? ` Hinweis: ${o.note[0].text}` : '';
      return `- ${nom}: ${dose} (verordnet am ${jour(o.authoredOn)}).${note}`;
    });
    const maj = med.map((o) => o.authoredOn).filter(Boolean).sort().pop();
    docs.push({
      ...commun,
      type: 'medication',
      titre: 'Medikationsliste eML (ePA)',
      texte: `Medikationsliste (eML) aus der ePA-Akte von ${etiquette(p)}:\n${lignes.sort().join('\n')}`,
      source_ref: `epa/${kvnr}/eml`,
      date: new Date(maj ?? Date.now()).toISOString(),
    });
  }
}
return docs.map((json) => ({ json }));
