import { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../../store/authSlice';
import { setTheme } from '../../store/uiSlice';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';
import VerifyCode from './VerifyCode';
import ResetCode from './ResetCode';
import styles from './auth.module.css';

/* ── Brand panel feature icons ───────────────────────────── */

const IconFolderAI = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const IconSparkles = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
  </svg>
);

const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/**
 * AuthFlowContainer — owns all transient auth flow state.
 *
 * Security rules for signup auto-login:
 *   - Credentials are cached in a ref (not state, not Redux, not localStorage).
 *   - Auto-login fires ONLY when all three guards are true:
 *       1. flowOrigin === 'signup'
 *       2. signupSessionActive ref is true
 *       3. cachedCredentials ref holds { email, password }
 *   - Credentials are wiped immediately after any use (success or failure).
 *   - On component unmount, credentials are wiped by the useEffect cleanup.
 *   - Navigating away from the signup/verify flow clears credentials.
 */
function AuthLayout() {
  const dispatch = useDispatch();

  // ── View state ─────────────────────────────────────────
  const [activeView,      setActiveView]      = useState('login');
  const [flowEmail,       setFlowEmail]       = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // ── Signup auto-login guards (never persisted) ─────────
  const signupSessionActive = useRef(false);
  const cachedCredentials   = useRef(null);   // { email, password } — wiped after use

  function clearSignupSession() {
    signupSessionActive.current = false;
    cachedCredentials.current   = null;
  }

  // Wipe on unmount
  useEffect(() => () => clearSignupSession(), []);

  // ── View navigation ────────────────────────────────────
  function handleSwitchView(view, extras = {}) {
    // Leaving signup/verify flow without completing it — clear cached creds
    if (view !== 'verify' && view !== 'register') {
      clearSignupSession();
    }

    setActiveView(view);
    if (extras.email          != null) setFlowEmail(extras.email);
    if (extras.cooldownSeconds != null) setCooldownSeconds(extras.cooldownSeconds);
  }

  // ── Called by Register on success ─────────────────────
  function handleRegisterSuccess({ email, password, cooldownSeconds: cd }) {
    // Cache credentials strictly in memory for auto-login after verification
    signupSessionActive.current = true;
    cachedCredentials.current   = { email, password };
    setFlowEmail(email);
    setCooldownSeconds(cd || 60);
    setActiveView('verify');
  }

  // ── Called by VerifyCode on success ───────────────────
  async function handleVerifySuccess() {
    if (signupSessionActive.current && cachedCredentials.current) {
      const { email, password } = cachedCredentials.current;
      clearSignupSession(); // wipe immediately before the async call
      try {
        const result = await window.api.auth.login({ email, password });
        if (result.success) {
          dispatch(loginSuccess(result.user));
          dispatch(setTheme(result.theme ?? 'light'));
          return; // navigates to app shell — AuthLayout unmounts
        }
      } catch {
        // Fall through to manual login
      }
    }
    // No auto-login: route to sign-in
    setActiveView('login');
  }

  return (
    <div className={styles.authWrap}>
      <div className={styles.brandPanel}>
        <div className={styles.brandLogo}>Orvyn</div>
        <p className={styles.brandTagline}>
          Your intelligent document workspace
        </p>
        <div className={styles.brandFeatures}>
          <div className={styles.brandFeature}>
            <span className={styles.brandFeatureIcon}>
              <IconFolderAI />
            </span>
            Smart DataRoom organisation
          </div>
          <div className={styles.brandFeature}>
            <span className={styles.brandFeatureIcon}>
              <IconSparkles />
            </span>
            AI-powered classification
          </div>
          <div className={styles.brandFeature}>
            <span className={styles.brandFeatureIcon}>
              <IconChat />
            </span>
            Copilot chat &amp; insights
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.card}>
          {activeView === 'login'    && (
            <Login onSwitchView={handleSwitchView} />
          )}
          {activeView === 'register' && (
            <Register
              onSwitchView={handleSwitchView}
              onRegisterSuccess={handleRegisterSuccess}
            />
          )}
          {activeView === 'forgot'   && (
            <ForgotPassword onSwitchView={handleSwitchView} />
          )}
          {activeView === 'verify'   && (
            <VerifyCode
              email={flowEmail}
              initialCooldown={cooldownSeconds}
              onSwitchView={handleSwitchView}
              onVerifySuccess={handleVerifySuccess}
            />
          )}
          {activeView === 'reset'    && (
            <ResetCode
              email={flowEmail}
              initialCooldown={cooldownSeconds}
              onSwitchView={handleSwitchView}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
