import { t } from '../i18n';

// Bandeau rouge : alarmes capteurs et contradictions entre documents.
export default function Alertes({ alertes }) {
  if (!alertes?.length) return null;

  return (
    <section className="alertes" role="alert" aria-label={t('alertes.titre')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l9 16H3zM12 10v4M12 17v.01" />
      </svg>
      <ul>
        {alertes.map((a, i) => (
          <li key={i}>
            <strong>{t(`alertes.types.${a.type}`)}</strong> – {a.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
