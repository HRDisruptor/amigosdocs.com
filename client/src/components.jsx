import { Link, NavLink } from 'react-router-dom';
import { useApp } from './app.jsx';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="AmigoDocs">
      <img src="/icon.svg" alt="" width="30" height="30" />
      <span>Amigo<b>Docs</b></span>
    </Link>
  );
}

// `compact` shows two-letter codes so the picker fits beside the logo on a phone.
export function LanguagePicker({ compact = false }) {
  const { locale, setLocale, t } = useApp();
  return (
    <select className="language-picker" aria-label={t('common.language')} value={locale} onChange={(e) => setLocale(e.target.value)}>
      <option value="es" aria-label="Español">{compact ? 'ES' : 'Español'}</option>
      <option value="en" aria-label="English">{compact ? 'EN' : 'English'}</option>
      <option value="pt" aria-label="Português">{compact ? 'PT' : 'Português'}</option>
    </select>
  );
}

const NAV = [
  { to: '/', key: 'nav.home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/help', key: 'nav.help', icon: 'M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z' },
  { to: '/chats', key: 'nav.chats', icon: 'M4 5h16v11H9l-5 4z' },
  { to: '/guides', key: 'nav.guides', icon: 'M5 4h10l4 4v12H5zM9 11h6M9 15h6' },
  { to: '/settings', key: 'nav.me', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z' },
];

export function Layout({ children, unread = 0 }) {
  const { user, t } = useApp();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <div className="topbar-right">
            {!user && <LanguagePicker compact />}
            {!user && <Link className="btn small ghost" to="/login">{t('auth.login')}</Link>}
            {user?.isAdmin && <Link className="btn small ghost" to="/admin">{t('nav.admin')}</Link>}
          </div>
        </div>
      </header>
      <main className={user ? 'page with-nav' : 'page'}>{children}</main>
      {user && (
        <nav className="tabs" aria-label={t('nav.main')}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              <span>{t(item.key)}</span>
              {item.to === '/chats' && unread > 0 && <i className="dot" aria-label={t('chat.unread', { count: String(unread) })}>{unread}</i>}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

export function ErrorNote({ error }) {
  const { errorText } = useApp();
  if (!error) return null;
  return <p className="note danger" role="alert">{errorText(error)}</p>;
}

export function Loading({ state, children }) {
  const { t } = useApp();
  if (state.loading && !state.data) return <p className="muted" aria-busy="true">{t('common.loading')}</p>;
  if (state.error && !state.data) return <ErrorNote error={state.error} />;
  return children(state.data);
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Stars({ rating, count }) {
  const { t } = useApp();
  if (!count) return <span className="muted small-text">{t('profile.no_reviews')}</span>;
  return (
    <span className="stars" aria-label={t('profile.rating_label', { rating: String(rating), count: String(count) })}>
      <span aria-hidden="true">★</span> {rating.toFixed(1)} <span className="muted">({count})</span>
    </span>
  );
}

export function VerifiedBadge({ verified }) {
  const { t } = useApp();
  return verified ? <span className="badge ok">✓ {t('profile.verified')}</span> : <span className="badge">{t('profile.not_verified')}</span>;
}

export function StatusBadge({ status }) {
  const { t } = useApp();
  const tone = { open: 'info', matched: 'ok', completed: 'ok', cancelled: '', pending: 'warn', accepted: 'ok', declined: '', closed: '', withdrawn: '' }[status] || '';
  return <span className={`badge ${tone}`}>{t(`status.${status}`)}</span>;
}

export function UrgencyBadge({ urgency }) {
  const { t } = useApp();
  if (urgency === 'low' || urgency === 'normal') return null;
  return <span className={`badge ${urgency === 'emergency' ? 'danger' : 'warn'}`}>{t(`urgency.${urgency}`)}</span>;
}

// One line that says what is needed and where.
export function RequestTitle({ request }) {
  const { doc, country } = useApp();
  return (
    <>
      <strong>{doc(request.docType)}</strong>
      <span className="muted"> · {request.city}, {country(request.country)}</span>
    </>
  );
}

// The progress tracker for a matched request.
export function Steps({ step }) {
  const { meta, t } = useApp();
  return (
    <ol className="steps" aria-label={t('steps.title')}>
      {meta.steps.map((name, index) => (
        <li key={name} className={index < step ? 'done' : index === step ? 'current' : ''} aria-current={index === step ? 'step' : undefined}>
          <span className="step-mark" aria-hidden="true">{index < step ? '✓' : index + 1}</span>
          <span>{t(`steps.${name}`)}</span>
        </li>
      ))}
    </ol>
  );
}

export function PersonLine({ person }) {
  const { country } = useApp();
  if (!person) return null;
  return (
    <div className="person">
      <span className="avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>
      <div>
        <Link to={`/people/${person.id}`} className="person-name">{person.name}</Link>
        {person.isHelper && person.helperCity && <div className="muted small-text">{person.helperCity}, {country(person.helperCountry)}</div>}
      </div>
    </div>
  );
}

export function SafetyReminder() {
  const { t } = useApp();
  return (
    <p className="note warn">
      {t('safety.reminder')} <Link to="/safety">{t('safety.read_rules')}</Link>
    </p>
  );
}
