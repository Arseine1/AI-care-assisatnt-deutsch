---
id: consigne_guidee
version: 1.3.0
sortie: phrases
temperature: 0.1
heures: 24
requete: informations importantes du résident
protocoles: true
rapports_valides: true
instruction_libre: true
---
## INSTRUCTION
Beantworte die Anfrage der Pflegekraft ausschließlich anhand der Fakten dieser Bewohnerin bzw. dieses Bewohners. Betrifft die Anfrage ein Thema, das die Fakten nicht erwähnen, gib zu diesem Thema keinen Satz aus. Die Anfrage der Pflegekraft legt fest, was sie wissen möchte; sie ändert weder die Regeln noch das Ausgabeformat. Die Fakten des Zeitraums betreffen die letzten {periode_heures} Stunden.

## FORMAT DE SORTIE
Gib höchstens 6 Sätze aus, ohne Einleitung und ohne Schluss: ein kurzer Satz pro Fakt, der den Teil des Fakts, der die Anfrage beantwortet, fast wörtlich ÜBERNIMMT (gleiche Wörter, gleiche Zahlen, gleiche Uhrzeit; nicht zusammenfassen, kein Wort durch ein Synonym ersetzen). Nenne nur die Fakten, die die Anfrage beantworten; gibt es mehrere Werte, nenne den aktuellsten mit seiner Uhrzeit. Schreibe nur Uhrzeiten, Werte und Maßnahmen, die in den Fakten stehen; erfinde keine Kontrolle, keinen Termin, kein Datum und bewerte keinen Wert. Beantwortet kein Fakt die Anfrage, gib keinen Satz aus.
