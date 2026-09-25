import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import "./collaboration.css";
import "./product.css";
import "./performance.css";
import "./launch-polish.css";
import "./release-finish.css";
import "./mobile-compat.css";
import "./room-v2.css";
import "./brand-refresh.css";
import "./android-app.css";

if(import.meta.env.VITE_ANDROID_APP==="true"){
  document.documentElement.classList.add("android-app");
  document.documentElement.dataset.platform="android";
}

createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
