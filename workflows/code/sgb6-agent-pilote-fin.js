// Rentenbeiträge, gesteuerter Agent – Ende der Steuerung (Bericht abgegeben, Grenze erreicht oder Abbruch). Aufgabe abgebrochen oder unterbrochen: Hier ist Schluss.
const r = $input.first().json;
if (r.statut !== 'en_cours') return [];
return [{ json: { sess: r.sess } }];
