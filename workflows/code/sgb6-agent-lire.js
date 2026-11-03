// Rentenbeiträge, Agent – Schritt 1: den Fragebogen (Rohdaten) lesen und versteckte Anweisungen erkennen (ignore, ignoriere, genehmige…).
// Die Protokollzeile enthält nur Zahlen: nie einen Namen oder eine Versicherungsnummer.
const debut = Date.now();
const d = $('Akte').first().json;
if (!d.id) throw new Error('Akte nicht gefunden');
const texte = String(d.questionnaire ?? '');
const suspects = detecterSuspects(texte);
return [
  {
    json: {
      fait: 1,
      journal: { etape: 'lire', outil: 'lire_document', resultat: `Dokument gelesen: ${texte.split('\n').length} Zeile(n), ${suspects.length} verdächtige Stelle(n) erkannt`, duree_ms: Date.now() - debut },
    },
  },
];
