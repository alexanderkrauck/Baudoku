import React, { useState } from 'react';
import { Cloud, AlertCircle, Loader2 } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth, provider } from '../lib/firebase';
import { setCachedAccessToken } from '../App';

export default function Login({ setUser }: { setUser: (user: User) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
        setUser(result.user);
      }
    } catch (err: any) {
      console.error(err);
      setError('Anmeldung fehlgeschlagen: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-neutral-900">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-neutral-100 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
          <Cloud className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-3">Baudokumentation</h1>
        <p className="text-neutral-500 mb-8 leading-relaxed">
          Einfache, KI-gestützte Dokumentation für die Baustelle. Melden Sie sich an, um zu starten.
        </p>
        
        <button 
          onClick={handleLogin}
          disabled={loading}
          className="w-full relative flex items-center justify-center gap-3 bg-white border border-neutral-300 rounded-lg px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          ) : (
            <svg viewBox="0 0 48 48" className="w-5 h-5">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          )}
          Anmelden mit Google
        </button>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-md text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-left">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
