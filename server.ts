import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const upload = multer({ dest: 'uploads/' });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // API Route for analyzing audio and photos
  app.post('/api/analyze', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'photos' }]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const audioFile = files['audio']?.[0];
      const photoFiles = files['photos'] || [];
      const photoTimestampsStr = req.body.photoTimestamps || '[]';
      const photoTimestamps = JSON.parse(photoTimestampsStr); // Array of { id, timestamp }

      if (!audioFile) {
        return res.status(400).json({ error: 'Audio file is required' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const uploadedParts = [];
      const uploadedGenAIFiles = [];

      try {
        // 1. Upload audio
        const audioUpload = await ai.files.upload({
          file: audioFile.path,
          mimeType: audioFile.mimetype,
        });
        uploadedGenAIFiles.push(audioUpload);
        uploadedParts.push({ fileData: { fileUri: audioUpload.uri, mimeType: audioUpload.mimeType } });

        // 2. Upload photos and include timestamp context in the prompt
        for (let i = 0; i < photoFiles.length; i++) {
          const photo = photoFiles[i];
          const timestampData = photoTimestamps.find((pt: any) => pt.id === photo.originalname) || { timestamp: 'unknown' };
          
          const photoUpload = await ai.files.upload({
            file: photo.path,
            mimeType: photo.mimetype,
          });
          uploadedGenAIFiles.push(photoUpload);
          
          // Inject text telling Gemini when this photo was taken
          uploadedParts.push(`[Photo taken at relative time: ${timestampData.timestamp}]`);
          uploadedParts.push({ fileData: { fileUri: photoUpload.uri, mimeType: photoUpload.mimeType } });
        }

        const prompt = `Du bist ein KI-Assistent für Baudokumentationen.
Deine Aufgabe ist es, eine Audioaufnahme eines Baumeisters, der durch eine Baustelle geht, exakt auf Deutsch zu transkribieren.
Zusätzlich erhältst du Fotos, die während des Rundgangs aufgenommen wurden, zusammen mit ihren relativen Zeitstempeln (wann sie während der Aufnahme gemacht wurden).

Aufgaben:
1. Transkribiere den gesamten gesprochenen Text.
2. Analysiere den Text und die Bilder, um die Dokumentation intelligent in Räume oder Bereiche (z.B. "Keller", "Badezimmer EG", "Außenfassade") zu gliedern.
3. Achte auf Hinweise im Text wie "Ich bin jetzt im...", "Wir betreten nun..." um Raumwechsel zu erkennen.
4. Ordne die Bilder (basierend auf ihrem Zeitstempel und Kontext) dem entsprechenden Raum und Textabschnitt zu.
5. Fasse für jeden Raum kurz zusammen, was dokumentiert wurde (Mängel, Fortschritt, etc.).

Gib das Ergebnis **ausschließlich** als valides JSON in exakt folgender Struktur zurück, ohne Markdown-Codeblöcke (kein \`\`\`json) und ohne zusätzlichen Text:

{
  "title": "Baudokumentation (Generierter Titel basierend auf Inhalt)",
  "summary": "Gesamtzusammenfassung der Begehung",
  "rooms": [
    {
      "name": "Name des Raums/Bereichs",
      "transcription": "Genauer Wortlaut der gesprochen wurde, während man in diesem Raum war",
      "summary": "Kurze Zusammenfassung für diesen Raum",
      "photoIds": ["original_filename_1.jpg", "original_filename_2.jpg"] // Nutze die Dateinamen der Bilder (aus dem Kontext oder der Reihenfolge)
    }
  ]
}

Hinweis zur Bildzuordnung: Die Bilder wurden in der gleichen Reihenfolge übergeben, wie sie im prompt als [Photo taken at...] markiert sind. Nutze diese Reihenfolge, um sie den Räumen zuzuordnen. Da du die echten Dateinamen nicht kennst, nenne sie einfach "photo_0", "photo_1", etc. entsprechend ihrer Reihenfolge im Input (0-basiert).
`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: [
            prompt,
            ...uploadedParts
          ],
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
          }
        });

        const jsonStr = response.text || "{}";
        let reportData;
        try {
          reportData = JSON.parse(jsonStr);
        } catch(e) {
          console.error("Failed to parse JSON from Gemini", jsonStr);
          reportData = { title: "Error parsing report", summary: jsonStr, rooms: [] };
        }
        
        // Clean up Gemini files
        for (const f of uploadedGenAIFiles) {
          try { await ai.files.delete({ name: f.name }); } catch (e) { /* ignore */ }
        }

        res.json(reportData);

      } catch (err: any) {
        console.error('Gemini API Error:', err);
        res.status(500).json({ error: err.message || 'Error processing with AI' });
      } finally {
        // Clean up local temp files
        fs.unlink(audioFile.path, () => {});
        for (const f of photoFiles) {
          fs.unlink(f.path, () => {});
        }
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
