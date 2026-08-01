import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted so the demo renders identically on any machine — the reference
// site relies on Inter being installed locally and silently falls back if not.
import "@fontsource-variable/inter";

import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
