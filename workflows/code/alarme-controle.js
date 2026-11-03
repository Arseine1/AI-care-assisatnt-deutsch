// Alarme de capteur – contrôle du message MQTT. SEUL le sujet (topic) compte : capteurs/chambre{n}/{type}.
// Le contenu du message n'est JAMAIS lu : un capteur défaillant ou piraté ne peut donc injecter aucun texte dans le
// système ni dans le prompt de l'IA.
const TYPES = { chute: 'Chute détectée', sortie_lit: 'Sortie de lit', appel: 'Appel du résident' };
const e = $input.first().json ?? {};
const topic = String(e.topic ?? '').slice(0, 80);
const m = topic.match(/^capteurs\/chambre(\d{1,3})\/(chute|sortie_lit|appel)$/);
if (!m) {
  // sujet inconnu : aucune alarme, mais la trace reste au journal (le sujet est nettoyé, jamais le contenu)
  return [{ json: { rejete: true, topic: topic.replace(/[^a-z0-9/_-]/gi, '?') } }];
}
return [{ json: { rejete: false, topic, chambre: String(Number(m[1])), type: m[2], libelle: TYPES[m[2]], recue_le: new Date().toISOString() } }];