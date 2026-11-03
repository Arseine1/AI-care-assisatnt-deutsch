// Antwort an die Oberfläche für einen von der KI verfassten Text (Modus A und Modus B): ein ENTWURF, nie eine Bestätigung.
// Die Sensoralarme sind noch nicht mit MQTT verbunden: « alertes » bleibt hier leer; die automatischen
// Kontrollen der Antwort erscheinen in « avertissements » (von der Pflegekraft zu prüfende Punkte).
const r = $input.first().json;
return [
  {
    json: {
      brouillon_id: r.brouillon_id,
      texte: r.texte,
      sources: r.sources ?? [],
      alertes: [],
      retirees: (r.retirees ?? []).map((x) => ({ phrase: x.phrase, source_id: x.source_id, motifs: x.motifs.map((m) => m.libelle), detail: x.detail })),
      avertissements: (r.avertissements ?? []).map((a) => ({ type: a.type, detail: String(a.detail ?? '').slice(0, 200) })),
    },
  },
];
