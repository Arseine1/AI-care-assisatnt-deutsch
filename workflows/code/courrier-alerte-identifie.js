// Eingegangene Post – Meldung zu einem Schreiben, das einem Bewohner ZUGEORDNET ist. Der Bericht der Kontrollregeln (ohne KI) bestimmt den Schweregrad:
// Widerspruch = rot; kein Widerspruch = Information (das Schreiben muss weiterhin von einer Pflegekraft bestätigt werden).
const lettres = $('Zu verarbeitende Post').all().map((i) => i.json).filter((d) => d.patient_id);
const alertes = $input.all().map((item, i) => {
  const l = lettres[i];
  const r = item.json ?? {};
  const courrier = { titre: l.titre, expediteur: l.expediteur, date: l.date, ref: l.source_ref };
  const resident = l.patient_label.replace(/\s*\((?:chambre|Zimmer)[^)]*\)\s*$/, '');
  const base = { resident, chambre: l.chambre, courrier, source: 'KIM (Arztbrief)' };
  const contradictions = (Array.isArray(r.alertes) ? r.alertes : []).map((a) => String(a.message ?? '').slice(0, 300));
  if (!r.brouillon_id) {
    return {
      topic: `courrier/${l.source_ref}`, chambre: l.chambre, libelle: 'Post erhalten: Prüfung nicht möglich', patient_id: l.patient_id,
      faits: { ...base, gravite: 'attention', avertissement: 'Die automatische Prüfung dieses Schreibens ist fehlgeschlagen. Öffnen Sie „Dokument prüfen“, um sie erneut zu starten.' },
    };
  }
  return {
    topic: `courrier/${l.source_ref}`,
    chambre: l.chambre,
    libelle: contradictions.length ? 'Widerspruch in einem Schreiben' : 'Schreiben zu bestätigen: kein Widerspruch',
    patient_id: l.patient_id,
    faits: { ...base, gravite: contradictions.length ? 'rouge' : 'info', contradictions, brouillon_id: r.brouillon_id },
  };
});
return [{ json: { alertes } }];