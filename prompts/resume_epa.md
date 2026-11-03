---
id: resume_epa
version: 1.1.0
sortie: phrases
sections: D=Diagnosen :|A=Allergien :|M=Medikation (eML-Liste) :
temperature: 0.1
heures: 24
requete: diagnostics allergies médication liste eML traitement dossier ePA
protocoles: false
sources_prioritaires: ePA|Base hôpital (FHIR)
---
## INSTRUCTION
Fasse die ePA-Akte dieser Bewohnerin bzw. dieses Bewohners für eine Pflegekraft zusammen. Verwende die Fakten mit der Quelle [ePA]; die Fakten der Krankenhausdatenbank ergänzen nur, was die ePA nicht sagt, mit ihrer eigenen Quelle. Allergien werden stets übernommen, gleich aus welcher Quelle, da sie für die Sicherheit wesentlich sind. Übernimm weder Pflegenotizen noch Ereignisse des Zeitraums.

## FORMAT DE SORTIE
Die Sätze verteilen sich auf drei Rubriken: D (Diagnosen), A (Allergien), M (Medikation, eML-Liste). Ein Satz pro Element. Gib bei der Medikation für jedes Medikament den Namen, die Dosis und das Einnahmeschema so an, wie sie im zitierten Fakt stehen, ohne etwas hinzuzufügen. Hat eine Rubrik keinen Fakt, gib ihr keinen Satz. Schlage keine Behandlung vor und bewerte keinen Wert.
