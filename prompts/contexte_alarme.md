---
id: contexte_alarme
version: 1.2.0
sortie: phrases
sections: A=Alarme :|C=Contexte du résident :|M=Mesure déjà prévue :
temperature: 0.1
heures: 24
requete: chute désorientation nuit sortie de lit alarme capteur risque mobilité
protocoles: true
sources_prioritaires: Capteurs
max_faits: 7
max_phrases: 4
longueur_phrase: 140
---
## INSTRUCTION
Une alarme de capteur vient de se déclencher pour ce résident ; elle est la ligne des faits dont la source est [Capteurs]. Donne au soignant, en quelques lignes, le contexte utile pour y répondre : ce que dit l'alarme, ce que les faits disent des risques et des incidents récents liés à cette situation, et la mesure déjà prévue par le protocole de la maison si elle existe. Tu ne décides pas de la conduite à tenir et tu ne donnes aucun ordre : tu rappelles uniquement les faits.

## FORMAT DE SORTIE
Les phrases sont réparties dans trois rubriques : A (l'alarme), C (contexte du résident), M (mesure déjà prévue). Une phrase courte par fait, 4 phrases au plus en tout (l'alarme, puis l'essentiel du contexte et la mesure prévue). Si les faits ne contiennent aucune alarme, ne donne aucune phrase dans A : n'invente jamais d'alarme. Si une rubrique n'a aucun fait, ne lui donne aucune phrase.
