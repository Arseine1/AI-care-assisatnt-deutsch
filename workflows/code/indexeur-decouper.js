// Indexer – Schritt 1: Jedes Dokument in Abschnitte von 300 bis 500 Wörtern zerlegen und die Kennungen berechnen.
//
// Eingabe (ein Element je Dokument):
//   { collection, texte, titre, source, source_label, source_ref, type, date,
//     patient_id?, chambre?, patient_label?, theme? }
// Ausgabe (ein Element je Abschnitt): { id, collection, embedText, payload }
//
// - id        : STABILE UUID = Hash aus (source, source_ref, Abschnittsnummer). Wird dasselbe Dokument erneut importiert,
//               überschreibt es denselben Punkt, statt ein Duplikat anzulegen.
// - empreinte : SHA-256 des Inhalts (Text + Datum + Patient + Typ). Ändert er sich, wird der Abschnitt aktualisiert.
const crypto = require('crypto');

const MIN = 300; // ein Abschnitt soll mindestens 300 Wörter haben …
const CIBLE = 400; // … es wird geteilt, sobald ~400 erreicht sind …
const MAX = 500; // … und nie über 500 hinaus.

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const nbMots = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const uuid = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

// Sätze (oder Zeilen); ein Satz mit mehr als MAX Wörtern wird zwangsweise geteilt.
function phrases(texte) {
  const brut = texte.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  const res = [];
  for (const p of brut) {
    const mots = p.split(/\s+/);
    if (mots.length <= MAX) res.push(p);
    else for (let i = 0; i < mots.length; i += CIBLE) res.push(mots.slice(i, i + CIBLE).join(' '));
  }
  return res;
}

function decouper(texte) {
  if (nbMots(texte) <= MAX) return [texte.trim()]; // ein kurzes Dokument bleibt ganz
  const morceaux = [];
  let courant = [];
  let n = 0;
  for (const p of phrases(texte)) {
    const m = nbMots(p);
    if (n > 0 && (n + m > MAX || n >= CIBLE)) {
      morceaux.push(courant.join('\n'));
      courant = [];
      n = 0;
    }
    courant.push(p);
    n += m;
  }
  if (courant.length) {
    const reste = courant.join('\n');
    const dernier = morceaux[morceaux.length - 1];
    // ein zu kurzer letzter Abschnitt wird dem vorherigen angefügt, wenn die Grenze es erlaubt
    if (n < MIN && dernier && nbMots(dernier) + n <= MAX) morceaux[morceaux.length - 1] = `${dernier}\n${reste}`;
    else morceaux.push(reste);
  }
  return morceaux;
}

const sortie = [];
for (const { json: d } of $input.all()) {
  const texte = String(d.texte ?? '').trim();
  if (!texte) continue;
  const morceaux = decouper(texte);
  morceaux.forEach((morceau, i) => {
    const id = uuid(sha256(`${d.source}|${d.source_ref}|${i}`));
    const empreinte = sha256(`${id}|${morceau}|${d.date ?? ''}|${d.patient_id ?? ''}|${d.type ?? ''}`);
    const contexte = [d.patient_label, d.titre].filter(Boolean).join(' – ');
    sortie.push({
      json: {
        id,
        collection: d.collection,
        // „search_document:“ ist das von nomic-embed-text erwartete Präfix; der Name des Bewohners hilft bei der Suche.
        embedText: `search_document: ${contexte ? contexte + '\n' : ''}${morceau}`,
        payload: {
          ...(d.patient_id ? { patient_id: d.patient_id } : {}),
          ...(d.chambre ? { chambre: String(d.chambre) } : {}),
          ...(d.theme ? { theme: d.theme } : {}),
          ...(d.expediteur ? { expediteur: d.expediteur } : {}),
          ...(d.statut ? { statut: d.statut } : {}),
          ...(d.motif ? { motif: d.motif } : {}),
          source: d.source,
          source_label: d.source_label,
          source_ref: d.source_ref,
          type: d.type,
          titre: d.titre,
          date: d.date,
          texte: morceau,
          chunk_index: i,
          chunk_total: morceaux.length,
          mots: nbMots(morceau),
          empreinte,
        },
      },
    });
  });
}
return sortie;
