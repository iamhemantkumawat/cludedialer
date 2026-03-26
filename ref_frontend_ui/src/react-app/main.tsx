import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/react-app/index.css";
import App from "@/react-app/App.tsx";
import { AuthProvider } from "@/react-app/context/AuthContext";
import { NotificationProvider } from "@/react-app/context/NotificationContext";
import { LanguageProvider } from "@/react-app/context/LanguageContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>
);
