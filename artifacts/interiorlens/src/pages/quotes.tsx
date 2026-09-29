import * as React from "react"
import { Link } from "wouter"
import { AppLayout } from "@/components/layout/app-layout"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Plus, Sparkles } from "lucide-react"
import { useListAnalyses } from "@workspace/api-client-react"
import { useAuth } from "@/context/auth-context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function QuotesPage() {
  const { user } = useAuth()
  const { data: analyses, isLoading } = useListAnalyses()
  const [query, setQuery] = React.useState("")
  const analysisHref = (id: string, status: string) =>
    `/analysis/${id}/${status === "complete" ? "report" : "processing"}`
  const visibleAnalyses = analyses?.filter((analysis) =>
    `${analysis.name} ${analysis.room} ${analysis.fileName ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  
  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-serif mb-2">Quote Repository</h1>
          <p className="text-muted-foreground text-sm">
            {user?.email
              ? `Logged in as ${user.email}. Displaying your latest 3 active quotations (older quotes are auto-cleaned).`
              : "Compare and track your latest 3 vendor quotations (older quotes are auto-cleaned)."}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quotes..."
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button asChild size="sm" className="shrink-0 text-xs">
            <Link href="/analysis/new">
              <Plus className="h-3.5 w-3.5 mr-1" /> New Quote
            </Link>
          </Button>
        </div>
      </div>

      {!user?.email && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-xs text-primary mb-1 font-mono uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" /> Save your quote history
            </div>
            <p className="text-xs text-muted-foreground">
              Sign in or create a free account to permanently store and access all your quotation audits from any phone or computer.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 text-xs bg-white">
            <Link href="/login?returnTo=/quotes">Sign In / Register</Link>
          </Button>
        </div>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading quotes...</TableCell>
              </TableRow>
            ) : visibleAnalyses?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No quotes received yet.</TableCell>
              </TableRow>
            ) : (
              visibleAnalyses?.map((analysis) => (
                <TableRow key={analysis.id}>
                  <TableCell>
                    <div className="font-medium">{analysis.name}</div>
                    <div className="text-xs text-muted-foreground">{analysis.fileName ?? "Quotation"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{analysis.room}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {analysis.replacementAnalysisId ? (
                      <Link
                        href={analysisHref(
                          analysis.replacementAnalysisId,
                          analyses?.find(
                            (candidate) => candidate.id === analysis.replacementAnalysisId,
                          )?.status ?? "processing",
                        )}
                        className="inline-flex items-center bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:underline"
                      >
                        Superseded by v2
                      </Link>
                    ) : (
                      <span className="inline-flex items-center bg-accent px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                        {analysis.status}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={analysisHref(analysis.id, analysis.status)}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  )
}
