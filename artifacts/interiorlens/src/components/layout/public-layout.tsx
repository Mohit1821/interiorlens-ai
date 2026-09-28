import * as React from "react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-9 max-w-[900px] items-center justify-between px-5 sm:h-12 sm:px-8">
          <Link href="/" className="font-sans text-[9px] font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity sm:text-sm">
            InteriorLens<span className="text-primary"> AI</span>
          </Link>
          <nav className="flex items-center gap-2 text-[6px] font-medium sm:gap-6 sm:text-[9px]">
            <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How it works</Link>
            <Link href="/sample-report" className="text-muted-foreground hover:text-foreground transition-colors">Sample Report</Link>
            <Link href="/quotes" className="text-muted-foreground hover:text-foreground transition-colors">Quotes</Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Workspace</Link>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {user && user.email ? (
              <>
                <Link href="/account" className="hidden sm:inline-block text-[9px] font-medium text-foreground hover:text-primary">
                  {user.firstName || user.email}
                </Link>
                <Button variant="ghost" size="sm" onClick={() => logout()} className="h-6 px-1.5 text-[6px] sm:h-8 sm:px-3 sm:text-[9px]">
                  Sign Out
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" asChild className="h-6 px-1.5 text-[6px] sm:h-8 sm:px-3 sm:text-[9px]">
                <Link href="/login">Sign In</Link>
              </Button>
            )}
            <Button className="h-6 px-2 text-[6px] sm:h-8 sm:px-4 sm:text-[9px]" asChild>
              <Link href="/analysis/new">Analyse Quote (Free)</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full">
        {children}
      </main>
      <footer className="border-t border-border bg-white py-4 sm:py-12">
        <div className="mx-auto flex max-w-[900px] flex-col items-start justify-between gap-7 px-5 sm:flex-row sm:px-8">
          <div>
            <Link href="/" className="font-sans text-[9px] font-semibold tracking-tight sm:text-sm">InteriorLens<span className="text-primary"> AI</span></Link>
            <p className="mt-2 max-w-[190px] text-[6px] leading-3 text-muted-foreground sm:text-[9px] sm:leading-4">InteriorLens AI is a quote review tool for home renovations. We help homeowners compare quotes, identify gaps, and ask better questions.</p>
          </div>
          <div className="grid grid-cols-3 gap-6 sm:gap-12">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[6px] uppercase tracking-wider text-muted-foreground sm:text-[8px]">Product</span>
              <Link href="/how-it-works" className="text-[7px] hover:text-primary sm:text-[9px]">Workflow</Link>
              <Link href="/sample-report" className="text-[7px] hover:text-primary sm:text-[9px]">Sample</Link>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[6px] uppercase tracking-wider text-muted-foreground sm:text-[8px]">Workspace</span>
              <Link href="/analysis/new" className="text-[7px] hover:text-primary sm:text-[9px]">Analyse quote</Link>
              <Link href="/dashboard" className="text-[7px] hover:text-primary sm:text-[9px]">Dashboard</Link>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[6px] uppercase tracking-wider text-muted-foreground sm:text-[8px]">Legal</span>
              <a href="/account" className="text-[7px] hover:text-primary sm:text-[9px]">Privacy</a>
              <a href="/account" className="text-[7px] hover:text-primary sm:text-[9px]">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
