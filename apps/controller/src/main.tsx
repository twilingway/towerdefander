import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { ControllerApp } from "./App.js";
import "./styles.css";

const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(
  <BrowserRouter>
    <ControllerApp />
  </BrowserRouter>
);
