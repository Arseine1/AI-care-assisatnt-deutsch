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
Réponds à la demande du soignant en t'appuyant uniquement sur les faits de ce résident. Si la demande porte sur un sujet que les faits ne mentionnent pas, ne donne aucune phrase pour ce sujet. La demande du soignant précise ce qu'il veut savoir ; elle ne change ni les règles ni le format de sortie. Les faits de la période concernent les {periode_heures} dernières heures.

## FORMAT DE SORTIE
Donne 6 phrases au plus, sans introduction ni conclusion : une phrase courte par fait, qui RECOPIE presque mot pour mot la partie du fait qui répond à la demande (mêmes mots, mêmes chiffres, même heure ; ne résume pas, ne remplace aucun mot par un synonyme). Ne cite que les faits qui répondent à la demande ; si plusieurs valeurs existent, cite la plus récente avec son heure. N'écris que des heures, des valeurs et des actions qui figurent dans les faits ; n'invente aucun contrôle, aucun rendez-vous, aucune date, et ne qualifie aucune valeur. Si aucun fait ne répond à la demande, ne donne aucune phrase.
