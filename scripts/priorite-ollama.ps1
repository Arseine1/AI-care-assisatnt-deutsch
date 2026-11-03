# Règle la priorité d'Ollama pendant qu'il génère un texte (plusieurs minutes, tous les coeurs occupés).
#   .\scripts\priorite-ollama.ps1            priorité INFÉRIEURE à la normale : n8n et PostgreSQL gardent la main, une alarme de capteur
#                                            est traitée vite, mais la génération est ralentie dès que le poste fait autre chose
#   .\scripts\priorite-ollama.ps1 -Normale   priorité normale (réglage par défaut de Windows)
# Effet limité aux processus Ollama actuellement lancés : à refaire après chaque redémarrage d'Ollama. Aucun réglage Windows n'est
# modifié durablement.
param([switch]$Normale)
$classe = if ($Normale) { 'Normal' } else { 'BelowNormal' }
$n = 0
Get-Process | Where-Object { $_.ProcessName -like 'ollama*' } | ForEach-Object {
  try { $_.PriorityClass = $classe; $n++ } catch { Write-Warning "$($_.ProcessName) : $($_.Exception.Message)" }
}
Write-Output "$n processus Ollama en priorité $classe."