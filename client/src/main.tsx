import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./collaboration.css";
import "./product.css";
import "./performance.css";
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
