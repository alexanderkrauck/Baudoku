import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Loader2 } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RecordPage from './pages/RecordPage';
import ReportPage from './pages/ReportPage';

export let cachedAccessToken: string | null = null;
export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        cachedAccessToken = null;
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={!user || !cachedAccessToken ? <Login setUser={setUser} /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/dashboard" 
          element={user && cachedAccessToken ? <Dashboard /> : <Navigate to="/" />} 
        />
        <Route 
          path="/record" 
          element={user && cachedAccessToken ? <RecordPage /> : <Navigate to="/" />} 
        />
        <Route 
          path="/report/:id" 
          element={user && cachedAccessToken ? <ReportPage /> : <Navigate to="/" />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

