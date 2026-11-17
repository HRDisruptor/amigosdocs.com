import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAction, useApp } from '../app.jsx';
import { ErrorNote, Field, LanguagePicker, VerifiedBadge } from '../components.jsx';

function TwoFactor() {
  const { t, user, setUser } = useApp();
  const action = useAction();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);

  const start = () => action.run(async () => setSetup(await post('/auth/2fa/setup')));
  const enable = (e) => {
    e.preventDefault();
    action.run(async () => {
      await post('/auth/2fa/enable', { code });
      setUser({ ...user, totpEnabled: true });
      setSetup(null);
      setCode('');
    });
  };
  const disable = (e) => {
    e.preventDefault();
    action.run(async () => {
      await post('/auth/2fa/disable', { password });
      setUser({ ...user, totpEnabled: false });
      setDisabling(false);
      setPassword('');
    });
  };

  return (
    <section className="card">
      <h2>{t('twofa.title')}</h2>
      <p className="muted">{t('twofa.intro')}</p>
      {user.totpEnabled && !disabling && (
        <>
          <p className="note ok">✓ {t('twofa.on')}</p>
          <button className="btn ghost" onClick={() => setDisabling(true)}>{t('twofa.turn_off')}</button>
        </>
      )}
      {user.totpEnabled && disabling && (
        <form onSubmit={disable}>
          <Field label={t('auth.password')}>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn danger-solid" disabled={action.busy}>{t('twofa.turn_off')}</button>
        </form>
      )}
      {!user.totpEnabled && !setup && (
        <>
          <ErrorNote error={action.error} />
          <button className="btn" onClick={start} disabled={action.busy}>{t('twofa.turn_on')}</button>
        </>
      )}
      {!user.totpEnabled && setup && (
        <form onSubmit={enable}>
          <p>{t('twofa.scan')}</p>
          <img className="qr" src={setup.qr} alt={t('twofa.qr_alt')} width="220" height="220" />
          <p className="small-text">{t('twofa.manual')} <code>{setup.secret}</code></p>
          <Field label={t('auth.code')}>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn accent" disabled={action.busy}>{t('twofa.confirm')}</button>
        </form>
      )}
    </section>
  );
}

function DeleteAccount() {
  const { t, setUser } = useApp();
  const navigate = useNavigate();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      await api('/me', { method: 'DELETE', body: { password } });
      setUser(null);
      navigate('/');
    });
  };
  if (!open) return <button className="linklike danger" onClick={() => setOpen(true)}>{t('settings.delete')}</button>;
  return (
    <form onSubmit={submit}>
      <p className="note warn">{t('settings.delete_warning')}</p>
      <Field label={t('auth.password')}>
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        <button className="btn danger-solid" disabled={action.busy}>{t('settings.delete_confirm')}</button>
      </div>
    </form>
  );
}

export function Settings() {
  const { t, user, setUser } = useApp();
  const navigate = useNavigate();
  const logout = async () => {
    await post('/auth/logout');
    setUser(null);
    navigate('/');
  };
  return (
    <>
      <h1>{t('settings.title')}</h1>
      <section className="card">
        <div className="row">
          <div>
            <strong>{user.name}</strong>
            <div className="muted">{user.email}</div>
          </div>
          {user.isHelper && <VerifiedBadge verified={user.verification === 'verified'} />}
        </div>
        <div className="actions start">
          <Link className="btn" to="/profile">{t('settings.edit_profile')}</Link>
          <Link className="btn ghost" to={`/people/${user.id}`}>{t('settings.view_public')}</Link>
        </div>
      </section>

      <section className="card">
        <h2>{t('common.language')}</h2>
        <LanguagePicker />
      </section>

      <TwoFactor />

      <section className="card">
        <h2>{t('settings.data')}</h2>
        <p className="muted">{t('settings.data_intro')}</p>
        <p><a className="btn ghost" href="/api/me/export" download>{t('settings.export')}</a></p>
        <DeleteAccount />
      </section>

      <p><Link to="/safety">{t('safety.title')}</Link></p>
      <button className="btn ghost wide" onClick={logout}>{t('auth.logout')}</button>
    </>
  );
}
