import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { loginSuccess, restoreComplete, logout } from './store/authSlice';
import { setTheme, setOnline, addToast } from './store/uiSlice';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import SettingsPage from './pages/setting';
import DataRoomList from './pages/DataRoomList';
import UploadPage from './pages/UploadPage';
import AuthPage from './pages/AuthPage';
import ResetPassword from './pages/ResetPassword';
import ToastContainer from './components/common/Toast';
import logoSrc from './assets/logo.png';
import './App.css';

function App() {
  const dispatch        = useDispatch();
  const theme           = useSelector((state) => state.ui.theme);
  const activePage      = useSelector((state) => state.ui.activePage);
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const isRestoring     = useSelector((state) => state.auth.isRestoring);
  const isOnline        = useSelector((state) => state.ui.isOnline);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.api.auth.restoreSession();
        if (result.success) {
          dispatch(loginSuccess(result.user));
          dispatch(setTheme(result.theme ?? 'light'));
        }
      } finally {
        dispatch(restoreComplete());
      }
    })();
  }, [dispatch]);

  useEffect(() => {
    const cleanup = window.api.auth.onSessionExpired(() => {
      dispatch(logout());
    });
    return cleanup;
  }, [dispatch]);

  useEffect(() => {
    const cleanup = window.api.app.onOfflineStatus((online) => {
      dispatch(setOnline(online));
      if (online) {
        dispatch(addToast({ message: "You're back online.", type: 'info' }));
      }
    });
    return cleanup;
  }, [dispatch]);

  return (
    <div className="app-shell" data-theme={theme}>
      {!isOnline && (
        <div className="offline-banner" role="status">
          Offline — server unreachable. Local data is read-only.
        </div>
      )}

      <Header />

      {window.location.pathname.startsWith('/reset-password') ? (
        <ResetPassword />
      ) : isRestoring ? (
        <div className="app-loading" aria-label="Loading">
          <img src={logoSrc} alt="Orvyn" className="app-loading-logo" />
          <div className="app-loading-dots">
            <span className="app-loading-dot" />
            <span className="app-loading-dot" />
            <span className="app-loading-dot" />
          </div>
        </div>
      ) : isAuthenticated ? (
        <div className="app-body">
          <Sidebar />
          <main className="app-content">
            {activePage === 'dataroom' && <DataRoomList />}
            {activePage === 'upload' && <UploadPage />}
            {activePage === 'settings' && <SettingsPage />}
          </main>
        </div>
      ) : (
        <AuthPage />
      )}

      <ToastContainer />
    </div>
  );
}

export default App;
