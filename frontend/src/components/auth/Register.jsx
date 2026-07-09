import { useState } from 'react';
import styles from './auth.module.css';

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

/**
 * Register — calls onRegisterSuccess({ email, password, cooldownSeconds })
 * so AuthLayout can cache credentials for the signup auto-login guard.
 */
function Register({ onSwitchView, onRegisterSuccess }) {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');

  const strength = getStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!name || !email || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.api.auth.register({ name, email, password });

      if (result.success) {
        onRegisterSuccess({
          email,
          password,
          cooldownSeconds: result.cooldownSeconds ?? 60,
        });
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className={styles.cardTitle}>Create account</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-name">Name</label>
          <input
            id="reg-name"
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-password">Password</label>
          <div className={styles.passwordWrap}>
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {password && (
            <div className={styles.strengthMeter}>
              <div className={styles.strengthBars}>
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={[
                      styles.strengthBar,
                      strength >= n ? styles.active : '',
                      strength >= n ? styles['s' + strength] : '',
                    ].join(' ')}
                  />
                ))}
              </div>
              <span className={[styles.strengthLabel, styles['s' + strength]].join(' ')}>
                {STRENGTH_LABELS[strength]}
              </span>
            </div>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-confirm">Confirm Password</label>
          <div className={styles.passwordWrap}>
            <input
              id="reg-confirm"
              type={showConfirm ? 'text' : 'password'}
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowConfirm((v) => !v)}
              tabIndex={-1}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={loading}>
          {loading && <span className={styles.spinner} />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className={styles.footer}>
        <span className={styles.switchText}>
          Already have an account?{' '}
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => onSwitchView('login')}
          >
            Sign in
          </button>
        </span>
      </div>
    </>
  );
}

export default Register;
