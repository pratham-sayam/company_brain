import { useState, useRef, useEffect } from 'react';
import styles from './auth.module.css';

const CODE_LENGTH = 6;

/**
 * VerifyCode — email verification step.
 *
 * @prop {string}   email           — email being verified (read-only display)
 * @prop {number}   initialCooldown — backend-driven resend cooldown in seconds
 * @prop {function} onSwitchView    — navigate to another view
 * @prop {function} onVerifySuccess — called after successful verification
 */
function VerifyCode({ email, initialCooldown = 0, onSwitchView, onVerifySuccess }) {
  const [digits,   setDigits]   = useState(Array(CODE_LENGTH).fill(''));
  const [status,   setStatus]   = useState('idle'); // 'idle' | 'verifying' | 'confirmed'
  const [error,    setError]    = useState('');
  const [cooldown, setCooldown] = useState(initialCooldown);
  const inputRefs = useRef([]);

  // Sync cooldown when parent updates initialCooldown (e.g. after resend)
  useEffect(() => { setCooldown(initialCooldown); }, [initialCooldown]);

  // Clear inputs and error when email changes (view re-entered)
  useEffect(() => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setError('');
  }, [email]);

  // Countdown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function handleChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    setError('');
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleVerify() {
    const code = digits.join('');
    if (code.length < CODE_LENGTH) {
      setError('Please enter all 6 digits.');
      return;
    }

    setStatus('verifying');
    setError('');

    try {
      const result = await window.api.auth.verifyEmail(email, code);

      if (result.success) {
        setDigits(Array(CODE_LENGTH).fill(''));
        setStatus('confirmed');
        await onVerifySuccess();
      } else {
        setDigits(Array(CODE_LENGTH).fill(''));
        if (result.retryAfterSeconds) {
          setCooldown(result.retryAfterSeconds);
        }
        setError(result.error || 'Verification failed.');
        setStatus('idle');
      }
    } catch {
      setError('An unexpected error occurred.');
      setStatus('idle');
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;

    try {
      const result = await window.api.auth.resendVerification(email);
      if (result.retryAfterSeconds) {
        setCooldown(result.retryAfterSeconds);
      } else {
        setCooldown(result.cooldownSeconds ?? 60);
      }
      setError('');
    } catch {
      setError('Failed to resend code. Please try again.');
    }
  }

  if (status !== 'idle') {
    return (
      <div className={styles.statusOverlay}>
        {status === 'verifying' && (
          <>
            <span className={styles.statusSpinner} />
            <p className={styles.statusText}>Verifying your code…</p>
          </>
        )}
        {status === 'confirmed' && (
          <>
            <svg className={styles.statusCheckmark} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <p className={styles.statusText}>Verified! Logging you in…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <h1 className={styles.cardTitle}>Verify your email</h1>

      <p className={styles.verifyHint}>
        Enter the 6-digit code sent to <strong>{email}</strong>.
      </p>

      <div className={styles.codeInputWrap} onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className={styles.codeDigit}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoFocus={i === 0}
          />
        ))}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.submit}
        onClick={handleVerify}
      >
        Verify
      </button>

      <div className={styles.resendRow}>
        {cooldown > 0 ? (
          <span className={styles.cooldownText}>Resend code in {cooldown}s</span>
        ) : (
          <button type="button" className={styles.switchLink} onClick={handleResend}>
            Resend code
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.switchLink}
          onClick={() => onSwitchView('login')}
        >
          Back to sign in
        </button>
      </div>
    </>
  );
}

export default VerifyCode;
