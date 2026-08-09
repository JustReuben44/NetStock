"use client";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; text: string };

const ToastContext = createContext<(type: ToastType, text: string) => void>(() => {});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, text: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div style={{
        position: "fixed", top: "1rem", right: "1rem", zIndex: 1000,
        display: "flex", flexDirection: "column", gap: "0.5rem",
        maxWidth: "min(360px, calc(100vw - 2rem))",
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "0.9rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
              background: t.type === "success" ? "var(--success)" : t.type === "error" ? "var(--danger)" : "var(--primary)",
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
