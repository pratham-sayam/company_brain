import { useState, useEffect } from 'react';
import styles from './Header.module.css';
import logoSrc from '../../assets/logo.png';

function Header() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Subscribe to maximize state changes from the main process.
    // onMaximizeChange returns a cleanup function to remove the listener.
    const cleanup = window.api.window.onMaximizeChange((maximized) => {
      setIsMaximized(maximized);
    });
    return cleanup;
  }, []);

  return (
    <header className={styles.header}>
      {/* Drag region — covers the full header except window control buttons */}
      <div className={styles.dragRegion}>
        <div className={styles.brandGroup}>
          <img src={logoSrc} alt="Orvyn" width="32" height="32" className={styles.logoMark} />
          <span className={styles.appTitle}>Orvyn</span>
        </div>
      </div>

      <div className={styles.windowControls}>
        {/* Minimize */}
        <button
          className={`${styles.controlBtn} ${styles.minimize}`}
          onClick={() => window.api.window.minimize()}
          title="Minimize"
          aria-label="Minimize window"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" aria-hidden="true">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          className={`${styles.controlBtn} ${styles.maximize}`}
          onClick={() => window.api.window.maximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        >
          {isMaximized ? (
            // Restore icon (two overlapping squares)
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2 0v2H0v8h8V8h2V0H2zm6 9H1V3h1v5h6V9zM3 1h6v6H3V1z"
                fill="currentColor"
              />
            </svg>
          ) : (
            // Maximize icon (single square outline)
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="0.5" y="0.5" width="9" height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          className={`${styles.controlBtn} ${styles.close}`}
          onClick={() => window.api.window.close()}
          title="Close"
          aria-label="Close window"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default Header;
