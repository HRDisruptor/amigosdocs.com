import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useAction, useApp } from '../app.jsx';
import { ErrorNote, Field } from '../components.jsx';

export function Login() {
  const { t, setUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', code: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const action = useAction();
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    action.setError(null);
    try {
      const { user } = await post('/auth/login', { email: form.email, password: form.password, ...(needsCode ? { code: form.code } : {}) });
      setUser(user);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      // The password was right and the account uses two-factor: ask for the code.
      if (err.code === 'totp_required') setNeedsCode(true);
      else action.setError(err);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>{t('auth.login')}</h1>
      <Field label={t('auth.email')}>
        <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </Field>
      <Field label={t('auth.password')}>
        <input type="password" autoComplete="current-password" required value={form.password} onChange={set('password')} />
      </Field>
      {needsCode && (
        <Field label={t('auth.code')} hint={t('auth.code_hint')}>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus value={form.code} onChange={set('code')} />
        </Field>
      )}
      <ErrorNote error={action.error} />
      <button className="btn accent wide">{t('auth.login')}</button>
      <p className="center">{t('auth.no_account')} <Link to="/signup">{t('auth.signup')}</Link></p>
    </form>
  );
}

export function Signup() {
  const { t, setUser, locale } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', agree: false });
  const action = useAction();
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      const { user } = await post('/auth/signup', { ...form, locale });
      setUser(user);
      navigate('/', { replace: true });
    });
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>{t('auth.signup')}</h1>
      <Field label={t('auth.name')} hint={t('auth.name_hint')}>
        <input autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={set('name')} />
      </Field>
      <Field label={t('auth.email')}>
        <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </Field>
      <Field label={t('auth.password')} hint={t('auth.password_hint')}>
        <input type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set('password')} />
      </Field>
      <label className="check">
        <input type="checkbox" required checked={form.agree} onChange={set('agree')} />
        <span>{t('auth.agree')} <Link to="/safety" target="_blank">{t('safety.title')}</Link>.</span>
      </label>
      <ErrorNote error={action.error} />
      <button className="btn accent wide" disabled={action.busy}>{t('auth.create')}</button>
      <p className="center">{t('auth.have_account')} <Link to="/login">{t('auth.login')}</Link></p>
    </form>
  );
}
