import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../client/src/components/ErrorBoundary";
import { App } from "./App";
import { installDesktopCaptureBridge } from "./services/desktopCaptureBridge";
import "./styles.css";

installDesktopCaptureBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App/>
    </ErrorBoundary>
  </StrictMode>
);
