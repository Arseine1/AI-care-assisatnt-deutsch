import { useCallback, useEffect, useRef, useState } from 'react';
import { alarmes as lireAlarmes, acquitterAlarme } from './api.js';

const INTERVALLE_MS = 2000;

// Deux bips courts (Web Audio) : le navigateur n'autorise le son qu'après un premier clic sur la page.
function bip() {
  try {
    const Contexte = window.AudioContext || window.webkitAudioContext;
    const ctx = new Contexte();
    [0, 0.28].forEach((retard) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + retard);
      o.stop(ctx.currentTime + retard + 0.18);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* pas de son possible : l'alarme reste affichée */
  }
}

// Interroge les alarmes toutes les 2 secondes. À chaque NOUVELLE alarme : deux bips courts, et le titre de l'onglet annonce
// le nombre d'alarmes en attente.
export function useAlarmes() {
  const [liste, setListe] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [observeHistorique, setObserveHistorique] = useState(false);
  const [connexionPerdue, setConnexionPerdue] = useState(false); // 3 interrogations de suite sans réponse : l'affichage n'est peut-être plus à jour
  const vues = useRef(null); // alarmes de capteurs déjà connues (la première lecture ne sonne pas)
  const titreOrigine = useRef(typeof document !== 'undefined' ? document.title : '');

  useEffect(() => {
    let actif = true;
    let minuteur;
    let echecs = 0;
    async function interroger() {
      try {
        const toutes = await lireAlarmes(observeHistorique);
        if (!actif) return;
        echecs = 0;
        setConnexionPerdue(false);
        setListe(toutes.filter((a) => a.statut !== 'acquittee'));
        setHistorique(toutes.filter((a) => a.statut === 'acquittee'));
        // le signal sonore ne concerne QUE les alarmes de capteurs ; les documents arrivent sans bruit
        const capteurs = toutes.filter((a) => a.statut !== 'acquittee' && a.type !== 'document');
        if (vues.current === null) vues.current = new Set(capteurs.map((a) => a.id));
        else {
          const nouvelles = capteurs.filter((a) => !vues.current.has(a.id));
          nouvelles.forEach((a) => vues.current.add(a.id));
          if (nouvelles.length) bip();
        }
      } catch {
        // connexion perdue : on garde l'affichage actuel, on réessaie, et au bout de 3 échecs on le DIT (une alarme manquée ne doit jamais être silencieuse)
        echecs += 1;
        if (actif && echecs >= 3) setConnexionPerdue(true);
      }
      if (actif) minuteur = setTimeout(interroger, INTERVALLE_MS);
    }
    interroger();
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [observeHistorique]);

  const alarmes = liste.filter((a) => a.type !== 'document');
  const documents = liste.filter((a) => a.type === 'document');

  useEffect(() => {
    document.title = alarmes.length ? `(${alarmes.length}) ALARME – ${titreOrigine.current}` : titreOrigine.current;
    return () => {
      document.title = titreOrigine.current; // déconnexion : plus d'alarme annoncée dans l'onglet
    };
  }, [alarmes.length]);

  const acquitter = useCallback(async (id) => {
    setListe((l) => l.filter((a) => a.id !== id));
    try {
      await acquitterAlarme(id);
    } catch {
      /* l'alerte réapparaîtra au prochain tour si l'acquittement n'a pas été enregistré */
    }
  }, []);

  return {
    alarmes,
    documents,
    historiqueAlarmes: historique.filter((a) => a.type !== 'document'),
    historiqueDocuments: historique.filter((a) => a.type === 'document'),
    acquitter,
    connexionPerdue,
    observerHistorique: setObserveHistorique,
  };
}