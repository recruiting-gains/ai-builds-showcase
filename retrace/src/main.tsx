import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import Experience from "./experience/Experience";
import "./experience/experience.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("observatory") ? <App /> : <Experience />}
  </React.StrictMode>,
);
