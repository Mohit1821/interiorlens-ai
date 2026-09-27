import { CheckCircle2, FileText } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

export default function AnalysisCompletePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl py-12">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.16em] text-primary">
          Analysis complete
        </p>
        <div className="border border-border bg-white p-8 sm:p-12">
          <CheckCircle2 className="mb-8 h-10 w-10 text-primary" />
          <h1 className="mb-4 text-4xl">Your quote review is ready.</h1>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            The foundation report has been assembled from the observations in
            this room. Review the findings, compare scope options, or move
            directly to vetted local specialists.
          </p>

          <div className="my-10 grid border border-border sm:grid-cols-2">
            <div className="border-b border-border p-5 sm:border-b-0 sm:border-r">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Findings captured
              </p>
              <p className="font-serif text-3xl">03</p>
            </div>
            <div className="p-5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Scope options
              </p>
              <p className="font-serif text-3xl">03</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => setLocation(`/analysis/${id}/report`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Open report
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}