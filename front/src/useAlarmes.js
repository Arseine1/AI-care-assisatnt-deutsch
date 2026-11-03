import { useCallback, useEffect, useRef, useState } from 'react';
import { alarmes as lireAlarmes, acquitterAlarme } from './api.js';

const INTERVALLE_MS = 2000;

// Zwei kurze Pieptöne (Web Audio): Der Browser erlaubt Ton erst nach einem ersten Klick auf die Seite.
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
    /* Ton nicht möglich: Der Alarm bleibt angezeigt */
  }
}

// Fragt die Alarme alle 2 Sekunden ab. Bei jedem NEUEN Alarm: zwei kurze Pieptöne, und der Tab-Titel zeigt
// die Anzahl der offenen Alarme an.
export function useAlarmes() {
  const [liste, setListe] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [observeHistorique, setObserveHistorique] = useState(false);
  const [connexionPerdue, setConnexionPerdue] = useState(false); // 3 Abfragen in Folge ohne Antwort: Die Anzeige ist möglicherweise nicht mehr aktuell
  const vues = useRef(null); // bereits bekannte Sensoralarme (die erste Abfrage löst keinen Ton aus)
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
        // der Signalton betrifft NUR Sensoralarme; Dokumente kommen ohne Ton an
        const capteurs = toutes.filter((a) => a.statut !== 'acquittee' && a.type !== 'document');
        if (vues.current === null) vues.current = new Set(capteurs.map((a) => a.id));
        else {
          const nouvelles = capteurs.filter((a) => !vues.current.has(a.id));
          nouvelles.forEach((a) => vues.current.add(a.id));
          if (nouvelles.length) bip();
        }
      } catch {
        // Verbindung verloren: Die aktuelle Anzeige bleibt, wir versuchen es erneut und melden es nach 3 Fehlversuchen (ein verpasster Alarm darf nie unbemerkt bleiben)
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
    document.title = alarmes.length ? `(${alarmes.length}) ALARM – ${titreOrigine.current}` : titreOrigine.current;
    return () => {
      document.title = titreOrigine.current; // Abmeldung: kein Alarm mehr im Tab angekündigt
    };
  }, [alarmes.length]);

  const acquitter = useCallback(async (id) => {
    setListe((l) => l.filter((a) => a.id !== id));
    try {
      await acquitterAlarme(id);
    } catch {
      /* Die Meldung erscheint bei der nächsten Abfrage erneut, falls die Quittierung nicht gespeichert wurde */
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