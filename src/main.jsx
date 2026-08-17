import React from "react";
import { createRoot } from "react-dom/client";
import { IconContext } from "@phosphor-icons/react";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* icons are decorative by default: every one sits next to text that already
        names it. a meaningful icon opts back in at its call site with
        aria-hidden={false} role="img" aria-label="..." */}
    <IconContext.Provider value={{ weight: "fill", "aria-hidden": true }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
);
