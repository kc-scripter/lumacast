import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../client/src/components/ErrorBoundary";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App/>
    </ErrorBoundary>
  </StrictMode>
);
