import { useEffect, useState } from 'react';
import { dernierRapportEtage } from '../api.js';
import { t } from '../i18n';
import { trouverResident } from './SelecteurResident.jsx';
import residents from '../mock/residents.json';

const ETAGES = [...new Set(residents.map((r) => r.etage))].sort((a, b) => a - b);

// Actions rapides : l'identifiant est envoyé au webhook n8n, le prompt reste côté serveur.
const ACTIONS = [
  { id: 'rapport_garde', cle: 'rapportGarde', icone: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5' },
  { id: 'resume_epa', cle: 'resumeEpa', icone: 'M4 5h16v14H4zM4 9h16M8 13h4' },
  { id: 'points_vigilance', cle: 'pointsVigilance', icone: 'M12 3l9 16H3zM12 10v4M12 17v.01' },
];

export default function ModeA({ chambre, onAction, onEtage, enCours }) {
  const [etage, setEtage] = useState('');
  const [recent, setRecent] = useState(null); // rapport d'étage déjà préparé (automatique de 5h30)

  useEffect(() => {
    setRecent(null);
    if (etage === '') return undefined;
    let actif = true;
    dernierRapportEtage(Number(etage)).then((r) => actif && setRecent(r)).catch(() => {});
    return () => { actif = false; };
  }, [etage]);

  return (
    <div className="mode-a">
      <div className="boutons-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            className="bouton-action"
            disabled={!chambre || enCours}
            onClick={() => onAction({ mode: 'a', action: a.id, chambre, resident: trouverResident(chambre) })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={a.icone} />
            </svg>
            <span>{t(`modeA.actions.${a.cle}`)}</span>
          </button>
        ))}
      </div>
      {!chambre && <p className="astuce">{t('modeA.choisirChambre')}</p>}

      <div className="bloc-etage">
        <h4>{t('etage.titre')}</h4>
        <p className="astuce">{t('etage.aide')}</p>
        <label className="champ">
          <span className="champ-label">{t('etage.label')}</span>
          <select value={etage} onChange={(e) => setEtage(e.target.value)}>
            <option value="">{t('etage.placeholder')}</option>
            {ETAGES.map((e) => (
              <option key={e} value={e}>{t('etage.option', { etage: e, n: residents.filter((r) => r.etage === e).length })}</option>
            ))}
          </select>
        </label>
        {recent && (
          <button className="bouton-action" disabled={enCours} onClick={() => onEtage(Number(etage), { tache_id: recent.tache_id })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{t(recent.automatique ? 'etage.ouvrirAuto' : 'etage.ouvrirRecent', { heure: new Date(recent.cree_le).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), n: recent.fait })}</span>
          </button>
        )}
        <button className="bouton-action" disabled={etage === '' || enCours} onClick={() => onEtage(Number(etage))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01" />
          </svg>
          <span>{t('etage.bouton')}</span>
        </button>
      </div>
    </div>
  );
}