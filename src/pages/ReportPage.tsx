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

  const handleRetryAnalysis = async () => {
    if (!report || !auth.currentUser) return;
    setSyncing(true); // Re-use the loading state
    
    try {
      const formData = new FormData();
      
      // Fetch audio blob if available
      if (report.rawAudioUrl && cachedAccessToken) {
        const audioRes = await fetch(`https://www.googleapis.com/drive/v3/files/${report.rawAudioUrl}?alt=media`, {
          headers: { Authorization: `Bearer ${cachedAccessToken}` }
        });
        if (!audioRes.ok) throw new Error('Audio konnte nicht von Drive geladen werden.');
        const audioBlob = await audioRes.blob();
        formData.append('audio', audioBlob, 'recording.webm');
      } else {
        alert("Keine Audio-Rohdaten gefunden oder Zugriff verweigert.");
        setSyncing(false);
        return;
      }
      
      // Fetch photo blobs
      const photoTimestamps: { id: string, timestamp: string }[] = [];
      if (report.rawPhotoUrls && report.rawPhotoUrls.length > 0 && cachedAccessToken) {
        for (let i = 0; i < report.rawPhotoUrls.length; i++) {
          const fileId = report.rawPhotoUrls[i];
          const photoRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${cachedAccessToken}` }
          });
          if (photoRes.ok) {
            const photoBlob = await photoRes.blob();
            const photoId = `photo_${i}`;
            formData.append('photos', photoBlob, photoId);
            // Without original relative times, we just pass sequential unknown times
            photoTimestamps.push({ id: photoId, timestamp: `00:0${i}` });
          }
        }
      }
      formData.append('photoTimestamps', JSON.stringify(photoTimestamps));

      // Re-run analysis
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('API Fehler bei der erneuten Analyse');
      const data = await response.json();
      
      // Map URLs to Report Data
      if (data.rooms) {
        data.rooms = data.rooms.map((room: any) => ({
          ...room,
          photoUrls: (room.photoIds || []).map((id: string) => {
            // Find the index of this photo
            const match = id.match(/photo_(\d+)/);
            if (match && report.rawPhotoUrls) {
              const idx = parseInt(match[1]);
              return report.rawPhotoUrls[idx] || '';
            }
            return '';
          })
        }));
      }
      
      const finalReportData: ReportData = {
        ...report,
        ...data,
        status: 'completed'
      };
      
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'reports', report.id), finalReportData);
      setReport(finalReportData);
      alert("Analyse erfolgreich!");
    } catch (err) {
      console.error(err);
      alert("Fehler bei der erneuten Analyse.");
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

  if (report.status === 'analyzing') {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-6" />
        <h2 className="text-2xl font-bold mb-4 text-neutral-900">Analyse läuft im Hintergrund</h2>
        <p className="text-neutral-500 max-w-sm mb-8">
          Die KI analysiert Ihre Aufnahme. Dieser Vorgang kann einige Minuten dauern. 
          Sie können diese Seite verlassen und später wiederkommen.
        </p>
        <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Zum Dashboard
        </button>
      </div>
    );
  }

  if (report.status === 'error') {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-neutral-900">Analyse fehlgeschlagen</h2>
        <p className="text-neutral-600 max-w-md mb-8">
          {report.summary || 'Beim Analysieren Ihrer Daten ist ein Fehler aufgetreten.'} 
          <br /><br />
          Keine Sorge, Ihre <strong>Audioaufnahme und Fotos wurden sicher in der Cloud gespeichert</strong>. Sie können die Analyse jetzt erneut starten.
        </p>
        <div className="flex gap-4">
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors">
            Zurück
          </button>
          <button 
            onClick={handleRetryAnalysis} 
            disabled={syncing}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {syncing && <Loader2 className="w-4 h-4 animate-spin" />}
            Analyse wiederholen
          </button>
        </div>
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
                        {room.photoUrls.map((url, pidx) => {
                          const fileId = url;
                          return (
                            <div key={pidx} className="aspect-square bg-neutral-100 rounded-lg border border-neutral-200 flex items-center justify-center overflow-hidden">
                              {fileId ? (
                                <img src={`https://lh3.googleusercontent.com/d/${fileId}`} alt={`Raumfoto ${pidx + 1}`} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs text-neutral-400 p-2 text-center break-all">{room.photoIds[pidx]}</span>
                              )}
                            </div>
                          );
                        })}
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
