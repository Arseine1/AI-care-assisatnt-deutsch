// Dokument prüfen – Fakten des Prompts « comparer »: die Fakten des Bewohners + das Schreiben (von der KI extrahierte
// Daten oder Rohtext, falls die Extraktion fehlgeschlagen ist: Die Regeln lesen immer den Text des Schreibens).
const c = $('Schreiben wählen').first().json;
const r = $('Verfassen (Extraktion)').first().json ?? {};
let objet = null;
try {
  objet = JSON.parse(r.texte ?? '');
} catch {
  /* Extraktion unlesbar: Es wird auf den Rohtext zurückgegriffen */
}
const l = c.lettre;
let texteLettre;
if (objet && typeof objet === 'object' && !Array.isArray(objet)) {
  const meds = (Array.isArray(objet.medicaments) ? objet.medicaments : []).map(
    (m) => `${m?.nom ?? '?'}${m?.dose ? ' ' + m.dose : ''}${m?.frequence ? ', ' + m.frequence : ''}${m?.duree ? ', ' + m.duree : ''}${m?.action ? ' (' + m.action + ')' : ''}`,
  );
  const liste = (a) => (Array.isArray(a) && a.length ? a.join(' ; ') : null);
  texteLettre =
    `Zu prüfendes Schreiben (extrahierte Daten): Patient ${[objet.patient?.prenom, objet.patient?.nom].filter(Boolean).join(' ') || 'unbekannt'}, geboren am ${objet.patient?.naissance ?? 'Datum unbekannt'}. ` +
    `Diagnosen: ${liste(objet.diagnostics) ?? 'keine'}. Medikamente: ${meds.join(' ; ') || 'keine'}. Empfehlungen: ${liste(objet.autres_recommandations) ?? 'keine'}.`;
} else {
  texteLettre = `Zu prüfendes Schreiben (Rohtext): ${String(l.texte).slice(0, 1500)}`;
}
const faits = [
  ...c.faits,
  { id: `F${c.faits.length + 1}`, label: 'KIM (Arztbrief)', texte: texteLettre, date: l.date, date_affichee: null, groupe: 'fond', type: 'lettre', ref: l.ref },
];
return [{ json: { patient: c.patient, periode: c.periode, autres: c.autres, faits, prompt_id: 'comparer' } }];
