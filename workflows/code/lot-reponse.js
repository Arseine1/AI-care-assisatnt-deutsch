// Stapel einer Etage bestätigen – Antwort an die Oberfläche.
const l = $('Stapel zusammenführen').first().json;
const a = $input.first().json ?? {};
return [
  {
    json: {
      ok: l.nb_valides > 0,
      nb_valides: l.nb_valides,
      refuses: l.refuses,
      apres_validation: l.nb_valides === 0 ? null : a.error ? { erreur: String(a.error.message ?? a.error).slice(0, 200) } : { rag: a.rag, transmission: a.transmission },
    },
  },
];
