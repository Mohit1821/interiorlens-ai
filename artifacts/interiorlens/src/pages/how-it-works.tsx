import * as React from "react"
import { PublicLayout } from "@/components/layout/public-layout"
import { Link } from "wouter"
import { ArrowRight, ChevronRight, FileSearch, Compass, LayoutDashboard } from "lucide-react"

export default function HowItWorksPage() {
  return (
    <PublicLayout>
      <div className="py-20 lg:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center mb-20">
          <h1 className="text-4xl md:text-5xl font-serif mb-6">The Methodology.</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            InteriorLens replaces subjective design guesswork with a strict, algorithmic pipeline. From image ingestion to vendor contracting.
          </p>
        </div>

        <div className="max-w-5xl mx-auto px-6 relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-border hidden md:block" />
          
          {[
            {
              step: "Phase 01",
              title: "Data Ingestion",
              desc: "Provide room specifications and imagery. Our system standardizes inputs to build a dimensional model of the space.",
              icon: LayoutDashboard
            },
            {
              step: "Phase 02",
              title: "Structural Extraction",
              desc: "Computer vision isolates load-bearing elements, plumbing nodes, and electrical constraints, flagging deviations from standard code.",
              icon: FileSearch
            },
            {
              step: "Phase 03",
              title: "Cost Modeling",
              desc: "Findings are cross-referenced with localized material and labor indices to generate realistic financial parameters.",
              icon: Compass
            }
          ].map((item, i) => (
            <div key={i} className={`relative flex flex-col md:flex-row items-center gap-8 md:gap-16 mb-24 last:mb-0 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
              <div className="flex-1 w-full text-center md:text-left md:w-1/2">
                <div className={`md:flex flex-col ${i % 2 === 1 ? 'md:items-end md:text-right' : 'md:items-start'}`}>
                  <span className="text-primary font-mono text-xs uppercase tracking-wider mb-3 block">{item.step}</span>
                  <h3 className="text-2xl font-serif mb-4">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-sm">{item.desc}</p>
                </div>
              </div>
              <div className="w-16 h-16 bg-white border border-border shadow-sm flex items-center justify-center shrink-0 relative z-10 mx-auto">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 w-full hidden md:block" />
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto px-6 mt-32 text-center">
          <div className="border border-border bg-sidebar p-12">
            <h2 className="text-2xl font-serif mb-4">Ready to test the pipeline?</h2>
            <p className="text-muted-foreground mb-8">Start your first workspace to experience the methodology in action.</p>
            <Link href="/dashboard" className="inline-flex h-12 items-center justify-center bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Initialize Workspace <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
