// Rentenbeiträge – sieht die hochgeladene Datei wie ein Fragebogen aus? (Lesen durch REGELN, nie durch die KI)
// Nötig sind mindestens das Aktenzeichen der Kasse und der Name der Pflegeperson. Ein verdächtiges Dokument wird akzeptiert (der Agent meldet es).
const e = $input.first().json ?? {};
if (e.refus) return [{ json: e }];
const texte = String(e.texte ?? '').replace(/\r\n/g, '\n').trim();
if (texte.length < 30) return [{ json: { refus: 'vide', message: 'Das Dokument enthält keinen verwertbaren Text.' } }];
const { donnees, recu_le } = extraireChamps(texte);
if (!donnees.ref_caisse || !donnees.aidant_nom) {
  return [{ json: { refus: 'pas_un_questionnaire', message: 'Dieses Dokument sieht nicht wie ein Fragebogen der Pflegekasse aus: Aktenzeichen oder Name der Pflegeperson nicht gefunden.' } }];
}
const nom = (p, n) => `${donnees[p] ?? ''} ${donnees[n] ?? ''}`.trim();
return [
  {
    json: {
      id: `dep-${require('crypto').randomBytes(5).toString('hex')}`,
      texte,
      aidant: nom('aidant_prenom', 'aidant_nom'),
      personne: nom('personne_prenom', 'personne_nom'),
      recu_le: recu_le ?? new Date().toISOString().slice(0, 10),
    },
  },
];
