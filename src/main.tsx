import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const Preview = import.meta.env.DEV
  ? lazy(() => import("./pages/PreviewPage"))
  : null;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {Preview && window.location.pathname === "/__preview" ? (
      <Suspense fallback={<p>Preview wird geladen …</p>}>
        <Preview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
