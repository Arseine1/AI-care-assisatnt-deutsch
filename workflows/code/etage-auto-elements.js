// Rapport d'étage automatique (5h30) – un élément par étage dont la tâche vient d'être créée.
// Aucun étage n'est créé deux fois en 3 heures (relance de n8n, déclenchement manuel) : la requête les écarte déjà.
return $input.all().map((i) => i.json).filter((r) => r.id).map((r) => ({ json: { etage: Number(r.etage), task_id: r.id } }));
