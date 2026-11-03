// Cotisations retraite – liste des dossiers pour l'interface : identifiant, aidant, personne soignée, date de réception, statut.
// Ni le texte du questionnaire ni le résultat ne partent dans la liste.
const lignes = $('Dossiers').all().map((i) => i.json).filter((r) => r.id);
// modèles permis par la page, et lesquels sont installés dans Ollama (liste /api/tags ; si Ollama ne répond pas : aucun n'est marqué installé)
const installes = ($input.first().json?.models ?? []).map((m) => m.name);
const modeles = __SGB6_MODELES__.map((nom) => ({ nom, installe: installes.some((n) => n === nom || n === `${nom}:latest`) }));
return [
  {
    json: {
      modele: __SGB6_MODELE__,
      modeles, // le modèle local qui pilote l'agent (variable d'environnement SGB6_MODELE à la génération)
      dossiers: lignes.map((r) => ({ id: r.id, aidant: r.aidant, personne_soignee: r.personne, recu_le: r.recu_le, statut: r.statut, revue: r.revue === true, traite: r.traite === true })),
    },
  },
];