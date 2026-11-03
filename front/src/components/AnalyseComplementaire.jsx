import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { analyseComplementaire, annulerTache } from '../api.js';
import Avertissements from './Avertissements.jsx';

const INTERVALLE_MS = 4000;

// „Dokument prüfen“: Die Kontrollregeln haben bereits geantwortet (Text oben). Der KI-Assistent führt im Hintergrund eine
// ergänzende Analyse durch; seine Anmerkungen erscheinen hier, als „zu bestätigen“ gekennzeichnet, und nehmen den Regeln nichts weg.
export default function AnalyseComplementaire({ analyse, onAlertes }) {
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    if (!analyse || analyse.statut !== 'en_cours') return undefined;
    let actif = true;
    let minuteur;
    async function suivre() {
      try {
        const r = await analyseComplementaire(analyse);
        if (!actif) return;
        setEtat(r);
        if (r.statut === 'en_cours') minuteur = setTimeout(suivre, INTERVALLE_MS);
        else if (r.resultat?.alertes?.length) onAlertes?.(r.resultat.alertes);
      } catch {
        if (actif) setEtat({ statut: 'termine_avec_erreurs', resultat: { indisponible: true } });
      }
    }
    suivre();
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [analyse, onAlertes]);

  async function annuler() {
    try {
      await annulerTache(analyse);
      setEtat({ statut: 'annulee' });
    } catch {
      /* Die Analyse läuft weiter: Beim nächsten Klick wird es erneut versucht */
    }
  }

  if (!analyse) return null;
  if (analyse.statut === 'desactivee') return <p className="astuce analyse">{t('analyse.desactivee')}</p>;
  if (!etat || etat.statut === 'en_cours') {
    return (
      <div className="analyse analyse-en-cours" role="status">
        <p>{t('analyse.enCours')}</p>
        <button type="button" className="lien-bouton" onClick={annuler}>{t('analyse.annuler')}</button>
      </div>
    );
  }
  if (etat.statut === 'annulee' || etat.statut === 'interrompue') {
    return <p className="analyse erreur-douce" role="status">{t(etat.statut === 'annulee' ? 'analyse.annulee' : 'analyse.interrompue')}</p>;
  }
  const r = etat.resultat ?? {};
  if (r.indisponible || etat.statut === 'termine_avec_erreurs') return <p className="analyse erreur-douce" role="status">{t('analyse.indisponible')}</p>;
  return (
    <section className="analyse" aria-label={t('analyse.titre')}>
      <h3>{t('analyse.titre')}</h3>
      {r.remarques?.length ? (
        <ul>
          {r.remarques.map((x, i) => (
            <li key={i}><strong>{t('analyse.aConfirmer')}</strong> {x.description}</li>
          ))}
        </ul>
      ) : (
        <p>{t('analyse.rienDeNouveau')}</p>
      )}
      <Avertissements liste={r.avertissements} />
    </section>
  );
}