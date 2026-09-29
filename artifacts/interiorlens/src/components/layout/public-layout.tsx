import * as React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-[1040px] items-center justify-between px-4 sm:px-8">
          <Link
            href="/"
            className="font-sans text-base sm:text-lg font-bold tracking-tight text-foreground hover:opacity-85 transition-opacity"
          >
            InteriorLens<span className="text-primary"> AI</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
              How it works
            </Link>
            <Link href="/sample-report" className="text-muted-foreground hover:text-foreground transition-colors">
              Sample Report
            </Link>
            <Link href="/quotes" className="text-muted-foreground hover:text-foreground transition-colors">
              Quotes
            </Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Workspace
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {user && user.email ? (
              <>
                <Link
                  href="/account"
                  className="hidden sm:inline-block text-xs font-medium text-foreground hover:text-primary transition-colors"
                >
                  {user.firstName || user.email}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/login">Sign In</Link>
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm font-medium shadow-sm rounded-full"
              asChild
            >
              <Link href="/analysis/new">Analyse Quote (Free)</Link>
            </Button>
          </div>
        </div>

        {/* Mobile secondary navigation strip */}
        <div className="flex md:hidden items-center justify-around border-t border-border/60 bg-sidebar/50 px-2 py-2 text-xs font-medium text-muted-foreground">
          <Link href="/how-it-works" className="px-2 py-1 hover:text-foreground">
            How it works
          </Link>
          <Link href="/sample-report" className="px-2 py-1 hover:text-foreground">
            Sample
          </Link>
          <Link href="/quotes" className="px-2 py-1 hover:text-foreground">
            Quotes
          </Link>
          <Link href="/dashboard" className="px-2 py-1 hover:text-foreground">
            Workspace
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full">{children}</main>

      <footer className="border-t border-border bg-white py-8 sm:py-12">
        <div className="mx-auto flex max-w-[1040px] flex-col justify-between gap-8 px-5 sm:flex-row sm:px-8">
          <div className="max-w-xs">
            <Link href="/" className="font-sans text-sm font-bold tracking-tight text-foreground">
              InteriorLens<span className="text-primary"> AI</span>
            </Link>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              InteriorLens AI is an independent quotation review engine for home renovations. We help homeowners detect hidden costs, unstated specifications, and risky terms before signing.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6 sm:gap-12">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Product</span>
              <Link href="/how-it-works" className="text-xs text-muted-foreground hover:text-primary transition-colors">Workflow</Link>
              <Link href="/sample-report" className="text-xs text-muted-foreground hover:text-primary transition-colors">Sample</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Workspace</span>
              <Link href="/analysis/new" className="text-xs text-muted-foreground hover:text-primary transition-colors">Upload Quote</Link>
              <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-primary transition-colors">Dashboard</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Legal</span>
              <a href="/account" className="text-xs text-muted-foreground hover:text-primary transition-colors">Privacy</a>
              <a href="/account" className="text-xs text-muted-foreground hover:text-primary transition-colors">Terms</a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-[1040px] border-t border-border/50 px-5 pt-4 text-center sm:px-8">
          <p className="text-[11px] text-muted-foreground">
            © 2026 InteriorLens AI. All rights reserved. Secure, private &amp; independent quotation analysis.
          </p>
        </div>
      </footer>
    </div>
  );
}
