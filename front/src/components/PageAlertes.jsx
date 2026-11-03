import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { CarteAlarme, heure } from './AlarmesCapteurs.jsx';

// Page d'alertes : « alarmes » (capteurs) ou « documents » (courriers, ePA), chacune sur sa page, avec son propre jeu de textes ;
// liste des alertes en attente et historique des 24 dernières heures.
export default function PageAlertes({ jeu, alarmes, historique, onAcquitter, onOuvrir, observerHistorique }) {
  useEffect(() => {
    observerHistorique(true);
    return () => observerHistorique(false);
  }, [observerHistorique]);

  return (
    <section className="panneau page-alertes">
      <div className="panneau-entete">
        <h2>{t(`alertes.${jeu}.titre`)}</h2>
        <p className="panneau-aide">{t(`alertes.${jeu}.description`)}</p>
      </div>

      <h3>{t(`alertes.${jeu}.enAttente`, { n: alarmes.length })}</h3>
      {alarmes.length === 0 ? (
        <div className="vide"><p>{t(`alertes.${jeu}.aucune`)}</p></div>
      ) : (
        <div className="alarmes-capteurs" role="alert">
          {alarmes.map((a) => <CarteAlarme key={a.id} alarme={a} onAcquitter={onAcquitter} onOuvrir={onOuvrir} />)}
        </div>
      )}

      <h3>{t(`alertes.${jeu}.historique`)}</h3>
      {historique.length === 0 ? (
        <p className="astuce">{t(`alertes.${jeu}.historiqueVide`)}</p>
      ) : (
        <ul className="historique-alarmes">
          {historique.map((a) => (
            <li key={a.id}>
              <strong>{heure(a.recue_le)}</strong>
              {` – ${a.libelle}`}
              {a.chambre ? ` – ${t('alarmes.chambre', { chambre: a.chambre })}` : ''}
              {a.faits?.resident ? ` – ${a.faits.resident}` : ''}
              {a.acquittee_le ? <span className="detail"> – {t(`alertes.${jeu}.acquitteeA`, { heure: heure(a.acquittee_le) })}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}