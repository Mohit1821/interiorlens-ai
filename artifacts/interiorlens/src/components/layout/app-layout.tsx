import * as React from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { BarChart, FolderOpen, Home, Settings, Search, FileText, Lightbulb, Shield } from "lucide-react"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/analysis/new", label: "New Analysis", icon: Search },
    { href: "/quotes", label: "Quotes", icon: FileText },
    { href: "/insights", label: "Insights", icon: Lightbulb },
    { href: "/account", label: "Account", icon: Settings },
  ]

  return (
    <div className="flex min-h-[100dvh] w-full bg-background flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-sidebar shrink-0 flex flex-col md:sticky md:top-0 md:h-[100dvh]">
        <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
          <Link href="/" className="font-serif text-xl tracking-tight font-medium">InteriorLens</Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible hide-scrollbar">
          {navItems.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors shrink-0",
                  isActive 
                    ? "bg-accent text-accent-foreground border-l-2 border-primary pl-2.5" 
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-l-2 border-transparent pl-2.5"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border shrink-0 hidden md:block">
          <div className="bg-white border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Workspace</p>
            <p className="text-sm font-semibold truncate">Personal Account</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
