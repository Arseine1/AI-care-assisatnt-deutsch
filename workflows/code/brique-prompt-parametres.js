// Parameter eines Prompts (Zeitraum, Suchbegriffe, Protokolle): gelesen aus prompts/*.md, nie von der Oberfläche
// geliefert. Die Oberfläche kann also weder wählen noch ändern, was von der KI verlangt wird, sondern nur, welche
// Aktion gestartet wird und für welchen Bewohner.
const PROMPTS = __PROMPTS__;

// Body der HTTP-Anfrage des Webhooks oder ein bereits von einem Eingangs-Workflow geprüftes Objekt: Gelesen werden nur patient_id und prompt_id.
const e = $input.first().json?.body ?? $input.first().json ?? {};
const prompt_id = String(e.prompt_id ?? '');
const p = PROMPTS[prompt_id];
if (!p) throw new Error(`Unbekannter Prompt: « ${prompt_id} »`);
return [
  {
    json: {
      patient_id: e.patient_id,
      prompt_id,
      heures: p.heures,
      requete: p.requete,
      protocoles: p.protocoles,
      rapports_valides: p.rapports_valides === true,
      max_faits: p.max_faits,
      sources_prioritaires: p.sources_prioritaires,
    },
  },
];
