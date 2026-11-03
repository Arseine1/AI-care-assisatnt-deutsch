// Après validation – résultat : combien de rapports ajoutés au RAG, et la transmission (envoyée ou en échec).
const m = $('Message de transmission').first().json;
const envoi = $('Envoyer (Mailpit)').first().json;
const note = $('Noter la transmission').first().json;
const rag = $('Indexer (RAG)').first().json ?? {};
const echec = Boolean(envoi?.error);
return [
  {
    json: {
      rag: { ajoutes: rag.morceaux_indexes ?? 0, ignores_deja_importes: rag.ignores_deja_importes ?? 0 },
      transmission: {
        id: note.id,
        statut: echec ? 'echec' : 'envoye',
        destinataire: m.destinataire,
        sujet: m.sujet,
        portee: m.portee,
        nb_rapports: m.validation_ids.length,
      },
      evenements_journal: [
        {
          evenement: 'ajout_rag',
          patient_id: m.patient_ids.length === 1 ? m.patient_ids[0] : null,
          mode: 'a',
          action: 'generer_sbar',
          details: { validations: m.validation_ids, morceaux: rag.morceaux_indexes ?? 0 },
        },
        {
          evenement: 'transmission',
          patient_id: m.patient_ids.length === 1 ? m.patient_ids[0] : null,
          mode: 'a',
          action: 'generer_sbar',
          details: { transmission_id: note.id, statut: echec ? 'echec' : 'envoye', portee: m.portee, etage: m.etage, validations: m.validation_ids },
        },
      ],
    },
  },
];
