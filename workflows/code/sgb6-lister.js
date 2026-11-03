// Rentenbeiträge – Liste der Akten für die Oberfläche: Kennung, Pflegeperson, pflegebedürftige Person, Eingangsdatum, Status.
// Weder der Text des Fragebogens noch das Ergebnis gehen in die Liste.
const lignes = $('Akten').all().map((i) => i.json).filter((r) => r.id);
// von der Seite zugelassene Modelle und welche davon in Ollama installiert sind (Liste /api/tags; antwortet Ollama nicht: keines gilt als installiert)
const installes = ($input.first().json?.models ?? []).map((m) => m.name);
const modeles = __SGB6_MODELES__.map((nom) => ({ nom, installe: installes.some((n) => n === nom || n === `${nom}:latest`) }));
return [
  {
    json: {
      modele: __SGB6_MODELE__,
      modeles, // das lokale Modell, das den Agenten steuert (Umgebungsvariable SGB6_MODELE bei der Generierung)
      dossiers: lignes.map((r) => ({ id: r.id, aidant: r.aidant, personne_soignee: r.personne, recu_le: r.recu_le, statut: r.statut, revue: r.revue === true, traite: r.traite === true })),
    },
  },
];
