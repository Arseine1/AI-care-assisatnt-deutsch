// Lettre validée – reconstitue la lettre à partir de ses morceaux (collection « a_verifier ») pour l'ajouter à « patients ».
// Type « lettre_validee » : distinct de « lettre » (l'empreinte du journal d'imports ne se confond pas avec celle de la version à vérifier).
const d = $('Décider').first().json;
const points = ($input.first().json?.result?.points ?? []).map((p) => p.payload).sort((a, b) => a.chunk_index - b.chunk_index);
if (!points.length) throw new Error('lettre introuvable dans « a_verifier »');
const p0 = points[0];
if (p0.patient_id !== d.patient_id) throw new Error('le résident de la lettre ne correspond pas à celui de la validation');
return [
  {
    json: {
      collection: 'patients',
      source: 'kim',
      source_label: 'KIM (lettre de médecin)',
      source_ref: p0.source_ref,
      type: 'lettre_validee',
      titre: `${p0.titre} (validée)`,
      expediteur: p0.expediteur,
      patient_id: p0.patient_id,
      chambre: p0.chambre,
      statut: 'valide',
      texte: points.map((p) => p.texte).join('\n'),
      date: p0.date,
    },
  },
];