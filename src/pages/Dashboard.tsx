import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { FileText, Plus, LogOut, Loader2 } from 'lucide-react';
import { ReportData } from '../types';
import { signOut } from 'firebase/auth';
import { setCachedAccessToken } from '../App';

export default function Dashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReports() {
      if (!auth.currentUser) return;
      try {
        const q = query(collection(db, 'users', auth.currentUser.uid, 'reports'), orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        const loaded: ReportData[] = [];
        querySnapshot.forEach((doc) => {
          loaded.push({ id: doc.id, ...doc.data() } as ReportData);
        });
        setReports(loaded);
      } catch (err) {
        console.error("Error loading reports", err);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setCachedAccessToken(null);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-neutral-800">Baudokumentationen</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-neutral-500 font-medium">Ihre bisherigen Begehungen</p>
          <button
            onClick={() => navigate('/record')}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Neue Begehung
          </button>
        </div>
        
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex gap-4 items-start">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900">Wie es funktioniert</h3>
            <p className="text-blue-800/80 text-sm mt-1 leading-relaxed">
              Klicken Sie auf <strong>"Neue Begehung"</strong>, um zu starten. Nehmen Sie ein durchgehendes Audio auf und schießen Sie Fotos von den Mängeln oder Fortschritten. Die KI ordnet Ihre Worte und Bilder am Ende automatisch den richtigen Räumen zu.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white border border-neutral-200 border-dashed rounded-xl p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Noch keine Dokumentationen</h3>
            <p className="text-neutral-500 max-w-sm mb-6">
              Starten Sie eine neue Begehung, um Fotos und Audio aufzunehmen. Die KI generiert daraus automatisch einen strukturierten Bericht.
            </p>
            <button
              onClick={() => navigate('/record')}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Jetzt starten
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <div 
                key={report.id} 
                onClick={() => navigate(`/report/${report.id}`)}
                className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-neutral-900 text-lg">{report.title || "Unbenannte Dokumentation"}</h3>
                    {report.status === 'analyzing' && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analyse läuft
                      </span>
                    )}
                    {report.status === 'error' && (
                      <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        Fehler bei Analyse
                      </span>
                    )}
                  </div>
                  <p className="text-neutral-500 text-sm">{new Date(report.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  <p className="text-neutral-600 text-sm mt-2 line-clamp-2">{report.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-blue-600 text-sm font-medium whitespace-nowrap bg-blue-50 px-3 py-1.5 rounded-lg">
                  <FileText className="w-4 h-4" />
                  Bericht ansehen
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
