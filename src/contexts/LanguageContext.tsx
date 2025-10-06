"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "es" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const translations = {
  es: {
    // Header
    "header.title": "Stella Hub",
    "header.showReport": "Ver Resumen",
    "header.hideReport": "Ocultar Resumen",
    "header.logout": "Cerrar sesión",

    // Messages
    "messages.loading": "Cargando conversación...",
    "messages.startConversation": "Envía un mensaje para comenzar",
    "messages.placeholder": "Escribe tu mensaje aquí...",
    "messages.placeholderLoading": "Cargando conversación...",
    "messages.sources": "Fuentes:",

    // Report
    "report.title": "Resumen de Investigación",

    // Language
    "language.spanish": "Español",
    "language.english": "English",

    // Sidebar
    "sidebar.title": "Conversaciones",
    "sidebar.newConversation": "Nueva conversación",
    "sidebar.creating": "Creando...",
    "sidebar.noConversations": "No hay conversaciones",
    "sidebar.deleteConfirm": "¿Estás seguro de eliminar esta conversación?",
    "sidebar.timeMinutes": "Hace unos minutos",
    "sidebar.timeHours": "Hace {hours}h",
    "sidebar.timeYesterday": "Ayer",
    "sidebar.timeDays": "Hace {days}d",
  },
  en: {
    // Header
    "header.title": "Stella Hub",
    "header.showReport": "Show Summary",
    "header.hideReport": "Hide Summary",
    "header.logout": "Sign out",

    // Messages
    "messages.loading": "Loading conversation...",
    "messages.startConversation": "Send a message to start",
    "messages.placeholder": "Type your message here...",
    "messages.placeholderLoading": "Loading conversation...",
    "messages.sources": "Sources:",

    // Report
    "report.title": "Research Summary",

    // Language
    "language.spanish": "Español",
    "language.english": "English",

    // Sidebar
    "sidebar.title": "Conversations",
    "sidebar.newConversation": "New conversation",
    "sidebar.creating": "Creating...",
    "sidebar.noConversations": "No conversations",
    "sidebar.deleteConfirm": "Are you sure you want to delete this conversation?",
    "sidebar.timeMinutes": "A few minutes ago",
    "sidebar.timeHours": "{hours}h ago",
    "sidebar.timeYesterday": "Yesterday",
    "sidebar.timeDays": "{days}d ago",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("es");

  useEffect(() => {
    // Cargar idioma guardado del localStorage
    const savedLanguage = localStorage.getItem("language") as Language;
    if (savedLanguage && (savedLanguage === "es" || savedLanguage === "en")) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let translation = translations[language][key as keyof typeof translations.es] || key;

    if (params) {
      Object.keys(params).forEach((param) => {
        translation = translation.replace(`{${param}}`, String(params[param]));
      });
    }

    return translation;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
