import React, { useState, useEffect } from 'react';
import { Cloud, CloudUpload, CloudDownload, LogIn, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { syncToDrive, loadFromDrive } from './lib/drive';
import { AppData } from './types';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Note: In a production app, the token should ideally be managed securely,
// but for this client-side preview, we keep it in memory.
let cachedAccessToken: string | null = null;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [data, setData] = useState<AppData>({ text: '', lastSynced: null });
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
        cachedAccessToken = null;
      } else {
        setAccessToken(cachedAccessToken);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        setAccessToken(credential.accessToken);
        setUser(result.user);
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to authenticate: ' + err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    cachedAccessToken = null;
    setAccessToken(null);
    setUser(null);
    setStatus({ type: 'idle', message: 'Signed out.' });
  };

  const handleSaveToDrive = async () => {
    if (!accessToken) return;
    setStatus({ type: 'loading', message: 'Saving to Drive...' });
    try {
      const payload = { ...data, lastSynced: new Date().toISOString() };
      await syncToDrive(payload, accessToken);
      setData(payload);
      setStatus({ type: 'success', message: 'Saved to Drive successfully!' });
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Failed to save to Drive.' });
    }
  };

  const handleLoadFromDrive = async () => {
    if (!accessToken) return;
    setStatus({ type: 'loading', message: 'Loading from Drive...' });
    try {
      const driveData = await loadFromDrive(accessToken);
      if (driveData && driveData.text !== undefined) {
        setData(driveData);
        setStatus({ type: 'success', message: 'Loaded from Drive successfully!' });
      } else {
        setStatus({ type: 'idle', message: 'No existing sync data found in Drive. Write some notes and save first!' });
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Failed to load from Drive.' });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-neutral-900">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-neutral-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
            <Cloud className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-3">Drive Sync Notes</h1>
          <p className="text-neutral-500 mb-8 leading-relaxed">
            A minimalist workspace that securely syncs your notes to Google Drive. Sign in to start writing.
          </p>
          
          <button 
            onClick={handleLogin}
            className="w-full relative flex items-center justify-center gap-3 bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-sm"
          >
            <svg viewBox="0 0 48 48" className="w-5 h-5">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
            Sign in with Google
          </button>
          
          {status.type === 'error' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-md text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-left">{status.message}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-neutral-200">
      <div className="max-w-3xl mx-auto p-6 pt-12 md:pt-20">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-800 flex items-center gap-2">
              <Cloud className="w-6 h-6 text-blue-600" />
              Drive Sync Notes
            </h1>
            <p className="text-neutral-500 text-sm mt-1">
              Welcome, {user.displayName || user.email}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                <CheckCircle2 className="w-4 h-4" />
                Connected
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-neutral-500 hover:text-neutral-700 underline underline-offset-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Main Editor */}
        <main className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleLoadFromDrive}
                disabled={!accessToken || status.type === 'loading'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <CloudDownload className="w-4 h-4 text-neutral-500" />
                Load
              </button>
              <button
                onClick={handleSaveToDrive}
                disabled={!accessToken || status.type === 'loading'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <CloudUpload className="w-4 h-4 text-blue-100" />
                Save
              </button>
            </div>
            {data.lastSynced && (
              <span className="text-xs font-medium text-neutral-400">
                Last synced: {new Date(data.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          
          <textarea
            value={data.text}
            onChange={(e) => setData({ ...data, text: e.target.value })}
            placeholder="Start typing your notes here..."
            className="w-full h-[500px] p-6 resize-none outline-none text-neutral-700 leading-relaxed placeholder:text-neutral-300"
            disabled={status.type === 'loading'}
          />
        </main>

        {/* Status Bar */}
        {status.message && (
          <div className={`mt-6 p-4 rounded-lg flex items-center gap-3 text-sm ${
            status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
            status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' :
            status.type === 'loading' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
            'hidden'
          }`}>
            {status.type === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
            {status.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
            {status.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
