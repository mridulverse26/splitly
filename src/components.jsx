import { useEffect } from "react";

export function Avatar({ person, size = 36 }) {
  if (!person) return null;
  const initials = person.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold shrink-0"
      style={{ background: person.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

export function Card({ children, className = "", onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-soft ${onClick ? "active:scale-[0.99] transition cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const base = "inline-flex items-center justify-center font-semibold rounded-xl px-4 py-2.5 transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100";
  const styles = {
    primary: "bg-accent-600 hover:bg-accent-700 text-white",
    ghost: "bg-slate-100 hover:bg-slate-200 text-ink",
    danger: "bg-red-50 hover:bg-red-100 text-red-600",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl p-5 anim-slide max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ink p-1 -m-1" aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">{label}</div>
      {children}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 ${props.className ?? ""}`}
    />
  );
}

export function EmptyState({ icon = "✨", title, subtitle, action }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-semibold mb-1">{title}</div>
      {subtitle && <div className="text-sm text-slate-500 mb-4">{subtitle}</div>}
      {action}
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-accent-50 text-accent-700",
    red: "bg-red-50 text-red-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tones[tone]}`}>{children}</span>;
}
