import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export const LEGAL = {
  app: "RuChat",
  owner: "Владелец приложения RuChat",
  email: "support@rusapp.su",
  updated: "1 ноября 2026 г.",
};

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-head text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-8 rounded-[14px] bg-card p-6 sm:p-10">
        <header className="space-y-3">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            ← Вернуться в {LEGAL.app}
          </Link>
          <h1 className="font-head text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
          <p className="text-sm text-muted-foreground">Редакция от {LEGAL.updated}</p>
        </header>
        {children}
        <footer className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">Политика конфиденциальности</Link>
          <Link to="/terms" className="hover:text-foreground">Пользовательское соглашение</Link>
          <a href={`mailto:${LEGAL.email}`} className="hover:text-foreground">{LEGAL.email}</a>
        </footer>
      </article>
    </main>
  );
}
