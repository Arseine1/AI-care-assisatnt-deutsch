import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { lireReglageAnalyseIA, ecrireReglageAnalyseIA } from '../api.js';
import SelecteurResident, { trouverResident } from './SelecteurResident.jsx';

// Vérifier à la demande la lettre en attente d'un résident : les règles de contrôle répondent tout de suite, l'analyse
// complémentaire de l'assistant IA suit en tâche de fond (réglage ci-dessous).
export default function VerifierDocument({ onVerifier, enCours }) {
  const [chambre, setChambre] = useState('');
  const [analyseIA, setAnalyseIA] = useState(true);
  useEffect(() => {
    lireReglageAnalyseIA().then(setAnalyseIA).catch(() => {});
  }, []);
  const changer = (actif) => ecrireReglageAnalyseIA(actif).then(setAnalyseIA).catch(() => {});
  return (
    <div className="verifier-document">
      <h3 className="section-page">{t('documentsPage.verifierTitre')}</h3>
      <p className="panneau-aide">{t('documentsPage.verifierAide')}</p>
      <SelecteurResident valeur={chambre} onChange={setChambre} />
      <button className="bouton-principal" disabled={!chambre || enCours} onClick={() => onVerifier({ mode: 'a', action: 'verifier_document', chambre, resident: trouverResident(chambre) })}>
        {t('modeA.actions.verifierDocument')}
      </button>
      <label className="reglage">
        <input type="checkbox" checked={analyseIA} onChange={(e) => changer(e.target.checked)} />
        <span>{t('modeA.analyseIA')}</span>
      </label>
    </div>
  );
}