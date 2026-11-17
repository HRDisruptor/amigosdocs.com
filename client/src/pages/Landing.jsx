import { Link } from 'react-router-dom';
import { useApp } from '../app.jsx';

export function Landing() {
  const { t } = useApp();
  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">{t('land.eyebrow')}</p>
        <h1>{t('land.h1')}</h1>
        <p className="lead">{t('land.sub')}</p>
        <div className="actions">
          <Link className="btn accent big" to="/signup">{t('land.cta_need')}</Link>
          <Link className="btn big" to="/signup">{t('land.cta_help')}</Link>
        </div>
      </section>

      <section>
        <h2>{t('land.how')}</h2>
        <ol className="how">
          {[1, 2, 3].map((n) => (
            <li key={n} className="card">
              <span className="how-number" aria-hidden="true">{n}</span>
              <h3>{t(`land.s${n}_t`)}</h3>
              <p>{t(`land.s${n}_b`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card trust">
        <h2>{t('land.trust_title')}</h2>
        <ul className="checks">
          {[1, 2, 3, 4].map((n) => <li key={n}>{t(`land.trust${n}`)}</li>)}
        </ul>
        <Link to="/safety">{t('safety.read_rules')}</Link>
      </section>
    </div>
  );
}
