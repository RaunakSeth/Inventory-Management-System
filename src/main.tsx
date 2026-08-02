import React from "react";
import ReactDOM from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme theme={neutralTheme} mode="dark">
      <AuthGate>
        <App />
      </AuthGate>
    </Theme>
  </React.StrictMode>
);
