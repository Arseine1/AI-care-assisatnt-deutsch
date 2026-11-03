// Rentenbeiträge – Entscheidung einer Person: { id, decision: valider | revue | refuser, motif }.
// Die Pflegekraft wird hier NICHT gelesen: Sie stammt aus der Sitzung (Knoten « Sitzung »), nie aus dem Inhalt der Anfrage.
const e = $input.first().json?.body ?? {};
const id = String(e.id ?? '');
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) throw new Error('Ungültige Akten-ID');
const decision = String(e.decision ?? '');
if (!['valider', 'revue', 'refuser'].includes(decision)) throw new Error('Unbekannte Entscheidung');
return [{ json: { id, decision, motif: String(e.motif ?? '').trim().slice(0, 500) } }];
