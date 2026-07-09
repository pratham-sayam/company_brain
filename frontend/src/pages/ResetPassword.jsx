import styles from '../components/auth/auth.module.css';

/**
 * ResetPassword page — compatibility notice.
 *
 * Password reset is now handled entirely inside the app via a 6-digit code.
 * The old link-based reset (?token=…) is no longer active.
 * This page exists only to handle any stale email links gracefully.
 */
function ResetPassword() {
  return (
    <div className={styles.authWrap}>
      <div className={styles.card}>
        <h1 className={styles.cardTitle}>Reset link expired</h1>
        <p className={styles.verifyHint}>
          Password reset links are no longer supported. To reset your password,
          open Orvyn and use <strong>Forgot password?</strong> on the sign-in
          screen — you will receive a 6-digit code by email instead.
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
