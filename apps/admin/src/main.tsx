import { createRoot } from "react-dom/client";

import { AdminApp } from "./App.js";
import "./styles.css";

const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(<AdminApp />);
