import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Mic, Pause, Square, Play, Loader2, ArrowLeft } from 'lucide-react';
import { CapturedPhoto, ReportData } from '../types';
import { db, auth, storage } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function RecordPage() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [duration, setDuration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();
      
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error("Error accessing microphone", err);
      alert("Fehler beim Zugriff auf das Mikrofon.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    return new Promise<Blob>((resolve) => {
      if (!mediaRecorderRef.current) return;
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        resolve(audioBlob);
      };
      
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  };

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const relativeTimeMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      
      // Use simple ID to map
      const photoId = `photo_${Date.now()}`;
      
      const newPhoto: CapturedPhoto = {
        id: photoId,
        blob: file,
        previewUrl: URL.createObjectURL(file),
        relativeTimeMs
      };
      
      setPhotos(prev => [...prev, newPhoto]);
    }
  };

  const handleFinish = async () => {
    if (!isRecording && photos.length === 0) return;
    setAnalyzing(true);
    
    try {
      let audioBlob: Blob | null = null;
      if (isRecording) {
        audioBlob = await stopRecording();
      }

      const formData = new FormData();
      if (audioBlob) {
        formData.append('audio', audioBlob, 'recording.webm');
      }
      
      const timestamps = photos.map(p => ({
        id: p.id,
        timestamp: formatTime(Math.floor(p.relativeTimeMs / 1000))
      }));
      formData.append('photoTimestamps', JSON.stringify(timestamps));
      
      photos.forEach(p => {
        formData.append('photos', p.blob, p.id);
      });

      // 1. Analyze via Gemini
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('API Fehler bei der Analyse');
      const data = await response.json();
      
      // 2. Upload photos to Firebase Storage
      const uploadedPhotos: Record<string, string> = {};
      if (auth.currentUser) {
        for (const photo of photos) {
          const storageRef = ref(storage, `users/${auth.currentUser.uid}/photos/${photo.id}`);
          await uploadBytes(storageRef, photo.blob);
          const downloadUrl = await getDownloadURL(storageRef);
          uploadedPhotos[photo.id] = downloadUrl;
        }
      }

      // 3. Map URLs to Report Data
      if (data.rooms) {
        data.rooms = data.rooms.map((room: any) => ({
          ...room,
          photoUrls: (room.photoIds || []).map((id: string) => uploadedPhotos[id] || '')
        }));
      }
      
      // 4. Save to Firebase Firestore
      if (auth.currentUser) {
        const reportId = Date.now().toString();
        const reportData: ReportData = {
          id: reportId,
          date: new Date().toISOString(),
          ...data
        };
        
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'reports', reportId), reportData);
        navigate(`/report/${reportId}`);
      }
    } catch (err) {
      console.error(err);
      alert('Fehler bei der Analyse. Bitte versuchen Sie es erneut.');
      setAnalyzing(false);
    }
  };

  if (analyzing) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center p-6">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-6" />
        <h2 className="text-2xl font-bold mb-2">KI-Analyse läuft...</h2>
        <p className="text-neutral-400 text-center max-w-sm">
          Ihre Aufnahme und Bilder werden transkribiert und räumlich zugeordnet. Dies kann einen Moment dauern.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between bg-neutral-950 border-b border-neutral-800">
        <button onClick={() => navigate('/dashboard')} className="text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="font-mono text-xl font-medium tracking-wider">
          {formatTime(duration)}
        </div>
        <div className="w-6" /> {/* Spacer */}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {/* Photo Gallery preview */}
        <div className="absolute top-6 left-6 right-6 flex gap-3 overflow-x-auto pb-4 snap-x">
          {photos.map((p, i) => (
            <div key={p.id} className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border-2 border-neutral-700 snap-start relative">
              <img src={p.previewUrl} alt={`Snap ${i}`} className="w-full h-full object-cover" />
              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">
                {formatTime(Math.floor(p.relativeTimeMs / 1000))}
              </div>
            </div>
          ))}
        </div>

        {/* Central Record Controls */}
        <div className="flex flex-col items-center gap-8 mt-20">
          {!isRecording ? (
            <button 
              onClick={startRecording}
              className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 hover:scale-105 transition-transform"
            >
              <Mic className="w-10 h-10 text-white" />
            </button>
          ) : (
            <div className="flex items-center gap-6">
              {isPaused ? (
                <button 
                  onClick={resumeRecording}
                  className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center hover:bg-neutral-600 transition-colors"
                >
                  <Play className="w-6 h-6 text-white" fill="currentColor" />
                </button>
              ) : (
                <button 
                  onClick={pauseRecording}
                  className="w-16 h-16 bg-neutral-700 rounded-full flex items-center justify-center hover:bg-neutral-600 transition-colors"
                >
                  <Pause className="w-6 h-6 text-white" fill="currentColor" />
                </button>
              )}
              
              <button 
                onClick={handleFinish}
                className="w-24 h-24 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Square className="w-8 h-8 text-red-500" fill="currentColor" />
              </button>
            </div>
          )}
          
          <p className="text-neutral-400 text-sm text-center max-w-xs">
            {!isRecording ? "Tippen Sie auf das Mikrofon, um die Begehung zu starten." : "Sprechen Sie Ihren Befund. Pausieren Sie bei Bedarf."}
          </p>
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="p-6 bg-neutral-950 flex items-center justify-center gap-6 border-t border-neutral-800">
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          className="hidden" 
          ref={fileInputRef}
          onChange={handleCapturePhoto}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={!isRecording}
          className={`flex items-center justify-center gap-3 w-full py-4 rounded-xl font-medium text-lg transition-colors ${
            isRecording ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
          }`}
        >
          <Camera className="w-6 h-6" />
          Foto aufnehmen
        </button>
      </footer>
    </div>
  );
}
