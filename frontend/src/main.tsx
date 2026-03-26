import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { DialerProvider } from "./app/context";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DialerProvider>
        <App />
      </DialerProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
