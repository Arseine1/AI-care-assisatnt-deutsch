// Baustein „Verfassen“ – Vorbereitung des Aufrufs des Sprachmodells (Ollama), Temperatur 0,1.
// Eingabe ist die Ausgabe der Vorlage (Feld „prompt“): Es wird kein anderer Text an die KI gesendet.
const e = $input.first().json;
// Die Blockmarker der Vorlage: deutsche und (alte) französische Schreibweise werden akzeptiert.
const hatMarker = (...marker) => marker.some((m) => e.prompt.includes(m));
if (typeof e.prompt !== 'string' || !hatMarker('[ROLLE UND REGELN]', '[RÔLE ET RÈGLES]') || !hatMarker('[AUSGABEFORMAT]', '[FORMAT DE SORTIE]')) {
  throw new Error('Prompt nicht gesperrt: Nur die Vorlage darf den an die KI gesendeten Text liefern.');
}
// In die Generierung eingebettetes Modell (workflows/generer.mjs, Umgebungsvariable AICARE_MODELE).
const MODELE = __MODELE__;
// Anzahl der Rechenthreads für Ollama (AICARE_THREADS, Standard 3): Auf einem Rechner mit 4 Kernen sollte mindestens einer für n8n und PostgreSQL frei bleiben,
// damit ein Sensoralarm nicht auf das Ende einer Generierung warten muss (siehe docs/vitesse.md).
const THREADS = __THREADS__;

// Ausgabe „phrases“: Ollama ERZWINGT dieses JSON-Schema bei der Generierung (strukturierte Ausgabe), nicht nur der Prompt.
// source_id ist auf die Kennungen der tatsächlich gelieferten Fakten beschränkt; minItems zwingt zu mehreren Sätzen
// (sonst hört ein kleines Modell nach dem ersten auf). Der Filter entfernt anschließend alles, was nicht belegt ist.
const idsFaits = (e.faits ?? []).map((f) => f.id);
const schemaPhrases = {
  type: 'object',
  properties: {
    phrases: {
      type: 'array',
      minItems: Math.min(4, idsFaits.length || 1, e.max_phrases ?? 8),
      maxItems: e.max_phrases ?? 8,
      items: {
        type: 'object',
        // Schlüssel aus einem Buchstaben: Jeder Schlüssel wird bei jedem Satz neu geschrieben, und das Modell schreibt auf diesem Rechner ca. 3 Wörter pro Sekunde
        // r = Rubrik, t = Text des Satzes, f = Kennung des Fakts
        properties: {
          r: { type: 'string', enum: (e.sections ?? []).length ? e.sections.map((s) => s.cle) : ['-'] },
          t: { type: 'string', maxLength: e.longueur_phrase ?? 220 }, // 140 schnitt Sätze mitten im Wort ab
          f: idsFaits.length ? { type: 'string', enum: idsFaits } : { type: 'string' },
        },
        required: ['r', 't', 'f'],
      },
    },
  },
  required: ['phrases'],
};
const format = e.sortie === 'phrases' ? schemaPhrases : e.sortie === 'json' ? 'json' : undefined;

const body = {
  model: MODELE,
  prompt: e.prompt,
  stream: false,
  keep_alive: '30m', // das Modell bleibt 30 Minuten geladen: kein Neuladen zwischen zwei Berichten derselben Etage
  // repeat_penalty: Ohne ihn kann ein kleines Modell bei niedriger Temperatur in eine Schleife geraten und dieselben Zeilen wiederholen.
  // num_predict: Eine Antwort aus JSON-Sätzen ist länger als ein reiner Text (wiederholte Schlüssel).
  options: { temperature: e.temperature ?? 0.1, num_thread: THREADS, num_ctx: 4096, num_predict: e.sortie === 'phrases' ? 450 : 500, seed: 42, repeat_penalty: 1.2, repeat_last_n: 128 },
  ...(format ? { format } : {}),
};
return [{ json: { ...e, modele: MODELE, body } }];
