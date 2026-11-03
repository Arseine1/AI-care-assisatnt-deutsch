// Bestätigter Arztbrief – setzt den Brief aus seinen Abschnitten (Collection « a_verifier ») wieder zusammen, um ihn zu « patients » hinzuzufügen.
// Typ « lettre_validee »: unterscheidet sich von « lettre » (der Fingerabdruck im Importprotokoll wird nicht mit dem der zu prüfenden Version verwechselt).
const d = $('Entscheiden').first().json;
const points = ($input.first().json?.result?.points ?? []).map((p) => p.payload).sort((a, b) => a.chunk_index - b.chunk_index);
if (!points.length) throw new Error('Schreiben in « a_verifier » nicht gefunden');
const p0 = points[0];
if (p0.patient_id !== d.patient_id) throw new Error('Der Bewohner des Schreibens stimmt nicht mit dem der Bestätigung überein');
return [
  {
    json: {
      collection: 'patients',
      source: 'kim',
      source_label: 'KIM (Arztbrief)',
      source_ref: p0.source_ref,
      type: 'lettre_validee',
      titre: `${p0.titre} (bestätigt)`,
      expediteur: p0.expediteur,
      patient_id: p0.patient_id,
      chambre: p0.chambre,
      statut: 'valide',
      texte: points.map((p) => p.texte).join('\n'),
      date: p0.date,
    },
  },
];