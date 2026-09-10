import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ReportData } from '../types';
import { ArrowLeft, CloudUpload, FileDown, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { cachedAccessToken } from '../App';
import { findOrCreateRootFolder, createSubFolder, uploadFileToFolder } from '../lib/drive';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  useEffect(() => {
    async function loadReport() {
      if (!auth.currentUser || !id) return;
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'reports', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReport(docSnap.data() as ReportData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const handleSyncDrive = async () => {
    if (!cachedAccessToken || !report) return;
    setSyncing(true);
    setSyncSuccess(false);
    
    try {
      // 1. Get root folder
      const rootId = await findOrCreateRootFolder(cachedAccessToken);
      
      // 2. Create specific subfolder for this report
      const safeTitle = (report.title || 'Dokumentation').replace(/[^a-zA-Z0-9 -]/g, '');
      const folderName = `${safeTitle} - ${new Date(report.date).toLocaleDateString('de-DE')}`;
      const subFolderId = await createSubFolder(folderName, rootId, cachedAccessToken);
      
      // 3. Upload report JSON as a document (or JSON file)
      const reportContent = JSON.stringify(report, null, 2);
      const blob = new Blob([reportContent], { type: 'application/json' });
      await uploadFileToFolder(blob, 'bericht_daten.json', 'application/json', subFolderId, cachedAccessToken);
      
      // (Normally we would also re-upload photos here if we had stored them in Firebase Storage)
      // For this prototype, we sync the structured data.
      
      setSyncSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Fehler beim Synchronisieren mit Google Drive');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold text-neutral-800">Bericht nicht gefunden</h2>
        <button onClick={() => navigate('/dashboard')} className="mt-4 text-blue-600">Zurück zum Dashboard</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pb-20">
      {/* Non-printable header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')} className="text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Zurück</span>
          </button>
          <div className="flex gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors shadow-sm"
            >
              <FileDown className="w-4 h-4" />
              PDF / Drucken
            </button>
            <button 
              onClick={handleSyncDrive}
              disabled={syncing || syncSuccess}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${
                syncSuccess ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : syncSuccess ? <CheckCircle2 className="w-4 h-4" /> : <CloudUpload className="w-4 h-4" />}
              {syncSuccess ? 'Gespeichert in Drive' : 'In Drive Speichern'}
            </button>
          </div>
        </div>
      </header>

      {/* Printable Report Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 print:p-0">
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 md:p-12 print:border-none print:shadow-none print:p-0">
          <div className="mb-12 border-b border-neutral-100 pb-8">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-4">{report.title}</h1>
            <div className="flex items-center gap-4 text-sm text-neutral-500">
              <span className="bg-neutral-100 px-3 py-1 rounded-full font-medium">Baudokumentation</span>
              <span>{new Date(report.date).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' })} Uhr</span>
            </div>
          </div>

          <div className="mb-12">
            <h2 className="text-xl font-semibold text-neutral-800 mb-4">Zusammenfassung</h2>
            <p className="text-neutral-600 leading-relaxed text-lg">{report.summary}</p>
          </div>

          <div className="space-y-12">
            {report.rooms.map((room, idx) => (
              <section key={idx} className="break-inside-avoid">
                <h3 className="text-xl font-semibold text-blue-900 mb-4 flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  {room.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-2">Befund</h4>
                    <p className="text-neutral-700 leading-relaxed mb-6">{room.summary}</p>
                    
                    <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-2">Transkript (Audio)</h4>
                    <p className="text-neutral-500 text-sm leading-relaxed italic bg-neutral-50 p-4 rounded-lg border border-neutral-100">
                      "{room.transcription}"
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-2">Verknüpfte Fotos ({room.photoUrls?.length || room.photoIds?.length || 0})</h4>
                    {room.photoUrls && room.photoUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {room.photoUrls.map((url, pidx) => (
                          <div key={pidx} className="aspect-square bg-neutral-100 rounded-lg border border-neutral-200 flex items-center justify-center overflow-hidden">
                            {url ? (
                              <img src={url} alt={`Raumfoto ${pidx + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs text-neutral-400 p-2 text-center break-all">{room.photoIds[pidx]}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-400 text-sm italic">Keine Fotos zugeordnet.</p>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
