"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon.tsx";

export function Dialog({ title, onClose, children, wide = false, error }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? "dialog-wide" : ""}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{error && <p role="alert" className="notice notice-error">{error}</p>}{children}
  </dialog>;
}
