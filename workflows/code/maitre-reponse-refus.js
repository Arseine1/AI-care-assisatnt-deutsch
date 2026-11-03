// Modus B – Antwort an die Oberfläche bei abgelehnter Anweisung: Es wurde nichts an die KI gesendet.
const c = $('Anweisung prüfen').first().json;
return [{ json: { refuse: true, motif: c.motif, message: c.message } }];
