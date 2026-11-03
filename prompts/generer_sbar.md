---
id: generer_sbar
version: 1.1.0
sortie: phrases
sections: S=S – Situation :|B=B – Background (Hintergrund) :|A=A – Assessment (Beurteilung) :|R=R – Recommendation (Empfehlung) :
temperature: 0.1
heures: 12
requete: incident chute douleur tension pouls température glycémie traitement médicament observation risque surveillance
protocoles: false
---
## INSTRUCTION
Verfasse die SBAR-Übergabe der letzten {periode_heures} Stunden für diese Bewohnerin bzw. diesen Bewohner, zuhanden des nächsten Teams. Übernimm ausschließlich die Fakten dieses Zeitraums und ordne sie nach ihrer Bedeutung für die Sicherheit der Person: zuerst Vorfälle, dann Vitalwerte, Behandlungen und Beobachtungen. Nenne zu jedem Vorfall die Uhrzeit, den gemessenen Wert und was unternommen wurde. Formuliere jeden Fakt in einem kurzen Satz neu: Übernimm niemals die Zeilen der Fakten und ihre Datumsangaben am Zeilenanfang. Die Hintergrundinformationen (Diagnosen, Allergien, Risiken, Medikationsplan) dienen nur der Rubrik B.

## FORMAT DE SORTIE
Die Sätze verteilen sich auf vier Rubriken: S (Situation: der Vorfall oder das Hauptereignis), B (Kontext der Bewohnerin / des Bewohners: Hintergrund, Allergien, Vorgeschichte), A (Beurteilung: Vitalwerte und Beobachtungen des Zeitraums), R (Empfehlung). Jede Rubrik enthält 1 bis höchstens 4 Sätze. Schreibe nur Uhrzeiten, Werte und Maßnahmen, die in den Fakten stehen: Erfinde keine Kontrolle, keinen Termin und kein Datum. Ein Kontrollblutzucker nach der Zuckergabe ist keine neue Hypoglykämie. Fasse niemals mehrere Fakten in einem Satz zusammen. Übernimm in R nur Maßnahmen oder Anweisungen, die bereits in den Fakten stehen (Überwachung, Protokoll, vorgesehene Kontrolle); schlage keine Behandlung, keine Dosis und keine neue Diagnose vor. Hat eine Rubrik keinen Fakt, gib ihr keinen Satz.
