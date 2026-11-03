// Connecteur « logiciel de soins » : transforme les notes et les fiches résidents en documents à indexer.
// Une note courte reste un morceau entier (garder sa date exacte permet de filtrer « les 12 dernières heures ») ;
// le découpage 300–500 mots de l'Indexeur ne s'applique qu'aux textes plus longs.
const iso = (d) => new Date(d).toISOString();
const etiquette = (r) => `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`;
const base = { source: 'logiciel_soins', source_label: 'Logiciel de soins', collection: 'patients' };

const docs = [];

for (const { json: n } of $('Notes récentes').all()) {
  docs.push({
    ...base,
    type: 'note',
    titre: `Note de soins (${n.categorie}) par ${n.auteur}`,
    texte: n.texte,
    source_ref: `note-${n.id}`,
    patient_id: n.patient_id,
    chambre: n.chambre,
    patient_label: etiquette(n),
    categorie: n.categorie,
    date: iso(n.horodatage),
  });
}

for (const { json: f } of $('Fiches résidents').all()) {
  const liste = (a, vide) => (a && a.length ? a.join(' ; ') : vide);
  const texte = [
    `Fiche résident : ${etiquette(f)}, né(e) le ${f.naissance}, étage ${f.etage}.`,
    `Diagnostics : ${liste(f.diagnostics, 'aucun')}.`,
    `Allergies : ${liste(f.allergies, 'aucune connue')}.`,
    `Régime : ${(f.regime ?? 'non précisé').replace(/\.\s*$/, '')}.`,
    `Risques : ${liste(f.risques, 'aucun signalé')}.`,
    `Plan de médication : ${f.medication ?? 'aucun'}.`,
    `Dernières constantes : ${f.vitaux ?? 'aucune'}.`,
  ].join('\n');
  docs.push({
    ...base,
    type: 'fiche',
    titre: 'Fiche résident (logiciel de soins)',
    texte,
    source_ref: `fiche-${f.patient_id}`,
    patient_id: f.patient_id,
    chambre: f.chambre,
    patient_label: etiquette(f),
    date: iso(f.maj ?? f.admission),
  });
}

return docs.map((json) => ({ json }));
