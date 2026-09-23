import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { DisplayApp } from "./App.js";
import { armAutoFullscreen } from "./model/fullscreen.js";
import "./styles.css";

const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Root element was not found");
}

// A phone takes the whole screen at the first touch; see `armAutoFullscreen`.
armAutoFullscreen();

// Production only: a service worker on a dev port outlives the dev server.
if (import.meta.env.PROD) {
  void import("./model/serviceWorker.js").then(({ startServiceWorker }) =>
    startServiceWorker(window.location.search)
  );
}

createRoot(rootElement).render(
  <BrowserRouter>
    <DisplayApp />
  </BrowserRouter>
);
