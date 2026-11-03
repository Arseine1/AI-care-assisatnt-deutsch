// Bericht bestätigen – Antwort an die Oberfläche: die Bestätigung, dann was folgte (RAG, Übergabe).
// Die Bestätigung bleibt gespeichert, auch wenn der nächste Schritt fehlschlägt: Der Fehler wird dann gemeldet, nicht verborgen.
const v = $('Speichern').first().json;
const a = $input.first().json ?? {};
return [
  {
    json: {
      ...v,
      apres_validation: a.error ? { erreur: String(a.error.message ?? a.error).slice(0, 200) } : { rag: a.rag, transmission: a.transmission },
    },
  },
];
