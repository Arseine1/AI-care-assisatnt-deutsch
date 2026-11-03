// Brique « chercher » – contrôle et normalisation des paramètres.
// Entrée : { patient_id, depuis?, jusqua?, heures?, requete?, limite?, protocoles? }
// Rien ici ne vient du texte libre d'un soignant : la requête de recherche est fournie par le prompt (Mode A)
// ou par une consigne DÉJÀ contrôlée (Mode B).
const e = $input.first().json ?? {};
const patient_id = String(e.patient_id ?? '');
if (!/^PAT-\d{3}$/.test(patient_id)) {
  throw new Error(`patient_id invalide : « ${patient_id} » (attendu : PAT-001, PAT-002…)`);
}
const jusqua = e.jusqua ? new Date(e.jusqua) : new Date();
const heures = Math.min(Math.max(Number(e.heures ?? 12), 1), 168); // 1 heure à 7 jours
const depuis = e.depuis ? new Date(e.depuis) : new Date(jusqua.getTime() - heures * 3600 * 1000);
if (Number.isNaN(depuis.getTime()) || Number.isNaN(jusqua.getTime()) || depuis > jusqua) {
  throw new Error('période invalide');
}
return [
  {
    json: {
      patient_id,
      depuis: depuis.toISOString(),
      jusqua: jusqua.toISOString(),
      requete: String(e.requete ?? 'informations importantes du résident').slice(0, 400),
      limite: Math.min(Math.max(Number(e.limite ?? 8), 1), 20),
      protocoles: e.protocoles === true,
      rapports_valides: e.rapports_valides === true,
      filtrer_requete: e.filtrer_requete === true, // Mode B : les faits qui parlent de la demande passent en premier
      max_faits: Math.min(Math.max(Number(e.max_faits ?? 8), 3), 40),
      sources_prioritaires: Array.isArray(e.sources_prioritaires) ? e.sources_prioritaires.map(String) : [],
    },
  },
];
