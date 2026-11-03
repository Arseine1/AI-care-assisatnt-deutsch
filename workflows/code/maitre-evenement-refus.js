// Mode B – événement d'audit « consigne_refusee » : motif, longueur et empreinte, jamais le texte de la consigne.
const c = $input.first().json;
return [
  {
    json: {
      evenement: 'consigne_refusee',
      patient_id: c.patient_id,
      mode: 'b',
      action: 'consigne_guidee',
      details: { motif: c.motif, longueur: c.longueur, empreinte_sha256: c.empreinte },
    },
  },
];
