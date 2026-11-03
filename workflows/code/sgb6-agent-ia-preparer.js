// Rentenbeiträge, Agent – Schritt 2 (Lesen durch die KI): Vorbereitung des Aufrufs von llama3.2 über Ollama.
// Temperatur 0, JSON-Ausgabe durch ein festes Schema vorgegeben. Der Fragebogen ist ein DATENSATZ zwischen Markierungen: Die Anweisung ändert sich nie.
const MODELE = __MODELE__;
const texte = $('Akte').first().json.questionnaire;
const body = {
  model: MODELE,
  prompt: consigneLectureIA(texte),
  stream: false,
  keep_alive: '30m',
  format: SCHEMA_LECTURE_IA,
  options: { temperature: 0, num_thread: __THREADS__, num_ctx: 4096, num_predict: 700, seed: 42, repeat_penalty: 1.1 },
};
return [{ json: { body, debut: Date.now(), modele: MODELE } }];
