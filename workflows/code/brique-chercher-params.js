// Baustein « Suchen » – Prüfung und Normalisierung der Parameter.
// Eingang: { patient_id, depuis?, jusqua?, heures?, requete?, limite?, protocoles? }
// Nichts hiervon stammt aus dem freien Text einer Pflegekraft: Die Suchanfrage liefert der Prompt (Modus A)
// oder eine BEREITS geprüfte Anweisung (Modus B).
const e = $input.first().json ?? {};
const patient_id = String(e.patient_id ?? '');
if (!/^PAT-\d{3}$/.test(patient_id)) {
  throw new Error(`Ungültige patient_id: « ${patient_id} » (erwartet: PAT-001, PAT-002 …)`);
}
const jusqua = e.jusqua ? new Date(e.jusqua) : new Date();
const heures = Math.min(Math.max(Number(e.heures ?? 12), 1), 168); // 1 Stunde bis 7 Tage
const depuis = e.depuis ? new Date(e.depuis) : new Date(jusqua.getTime() - heures * 3600 * 1000);
if (Number.isNaN(depuis.getTime()) || Number.isNaN(jusqua.getTime()) || depuis > jusqua) {
  throw new Error('Ungültiger Zeitraum');
}
return [
  {
    json: {
      patient_id,
      depuis: depuis.toISOString(),
      jusqua: jusqua.toISOString(),
      requete: String(e.requete ?? 'wichtige Informationen zum Bewohner').slice(0, 400),
      limite: Math.min(Math.max(Number(e.limite ?? 8), 1), 20),
      protocoles: e.protocoles === true,
      rapports_valides: e.rapports_valides === true,
      filtrer_requete: e.filtrer_requete === true, // Modus B: Fakten, die von der Anfrage handeln, kommen zuerst
      max_faits: Math.min(Math.max(Number(e.max_faits ?? 8), 3), 40),
      sources_prioritaires: Array.isArray(e.sources_prioritaires) ? e.sources_prioritaires.map(String) : [],
    },
  },
];
