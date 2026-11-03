---
id: contexte_alarme
version: 1.2.0
sortie: phrases
sections: A=Alarm :|C=Kontext der Bewohnerin / des Bewohners :|M=Bereits vorgesehene Maßnahme :
temperature: 0.1
heures: 24
requete: chute désorientation nuit sortie de lit alarme capteur risque mobilité
protocoles: true
sources_prioritaires: Sensoren
max_faits: 7
max_phrases: 4
longueur_phrase: 140
---
## INSTRUCTION
Für diese Bewohnerin bzw. diesen Bewohner hat soeben ein Sensoralarm ausgelöst; er ist die Zeile der Fakten mit der Quelle [Sensoren]. Gib der Pflegekraft in wenigen Zeilen den Kontext, der für die Reaktion nützlich ist: was der Alarm besagt, was die Fakten über die Risiken und jüngsten Vorfälle im Zusammenhang mit dieser Situation sagen, und die bereits durch das Protokoll des Hauses vorgesehene Maßnahme, falls es eine gibt. Du entscheidest nicht über das weitere Vorgehen und gibst keine Anweisung: Du rufst ausschließlich die Fakten in Erinnerung.

## FORMAT DE SORTIE
Die Sätze verteilen sich auf drei Rubriken: A (der Alarm), C (Kontext der Bewohnerin / des Bewohners), M (bereits vorgesehene Maßnahme). Ein kurzer Satz pro Fakt, insgesamt höchstens 4 Sätze (der Alarm, dann das Wesentliche zum Kontext und die vorgesehene Maßnahme). Enthalten die Fakten keinen Alarm, gib in A keinen Satz aus: Erfinde niemals einen Alarm. Hat eine Rubrik keinen Fakt, gib ihr keinen Satz.
