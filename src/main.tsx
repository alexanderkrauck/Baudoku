import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
const RecordingPreview = import.meta.env.DEV
  ? lazy(() => import("./pages/RecordPage"))
  : null;

const Preview = import.meta.env.DEV
  ? lazy(() => import("./pages/PreviewPage"))
  : null;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {RecordingPreview && window.location.pathname === "/__recording-preview" ? (
      <Suspense fallback={<p>Aufnahme-Test wird geladen …</p>}>
        <BrowserRouter>
          <RecordingPreview previewOnly />
        </BrowserRouter>
      </Suspense>
    ) : Preview && window.location.pathname === "/__preview" ? (
      <Suspense fallback={<p>Preview wird geladen …</p>}>
        <Preview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
