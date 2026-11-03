// Nach der Bestätigung – Dokumente, die dem RAG hinzugefügt werden: der von der Pflegekraft BESTÄTIGTE Text (gelesen, gegebenenfalls korrigiert),
// gelesen in der Tabelle der Bestätigungen (maßgebliche Quelle), nie der rohe Text der KI und nie ein von außen empfangener Text.
// Ein bestätigter Bericht wird mit der Quelle « Bestätigter Bericht » und dem Typ « rapport_valide » indexiert: Neue
// SBAR-Berichte lesen ihn nicht als Fakt erneut (siehe « Suchen »), er bleibt aber für den Modus B abrufbar.
const fmt = (d) => {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}:${g('minute')} Uhr`;
};
const lignes = $input.all().map((i) => i.json).filter((r) => r.validation_id);
return lignes.map((r) => ({
  json: {
    collection: 'patients',
    texte: r.texte,
    titre: `Bestätigter Dienstbericht (SBAR), ${fmt(r.valide_le)}`,
    source: 'validation',
    source_label: 'Bestätigter Bericht',
    source_ref: `validation-${r.validation_id}`,
    type: 'rapport_valide',
    patient_id: r.patient_id,
    chambre: r.chambre,
    patient_label: `${r.civilite} ${r.prenom} ${r.nom} (Zimmer ${r.chambre})`,
    date: new Date(r.valide_le).toISOString(),
  },
}));
