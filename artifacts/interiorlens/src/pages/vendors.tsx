import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useListVendors } from "@workspace/api-client-react"
import { Search, FileWarning } from "lucide-react"

export default function VendorsPage() {
  const { data: vendors, isLoading } = useListVendors()

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif mb-2">Curated Directory</h1>
          <p className="text-muted-foreground text-sm">Vendor records are displayed only when their supporting evidence is available.</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-muted animate-pulse border border-border" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors?.map(vendor => {
            const hasEvidence = vendor.evidence.length > 0
            return (
            <Card key={vendor.id} className="group">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <CardTitle className="text-lg">{hasEvidence ? vendor.name : "Vendor details withheld"}</CardTitle>
                </div>
                <CardDescription className="text-primary font-medium">
                  {hasEvidence ? vendor.specialty : "No evidence record attached"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {hasEvidence ? (
                  <div className="flex items-center justify-between text-xs pt-4 mt-2 border-t border-border/50 text-muted-foreground">
                    <span>Evidence status</span>
                    <span className="font-mono">{vendor.evidence[0].verificationStatus.replaceAll("_", " ")}</span>
                  </div>
                ) : (
                  <div className="flex gap-2 text-sm text-muted-foreground">
                    <FileWarning className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>Vendor identity, rating, location, and response-time claims are not shown without structured evidence.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )})}
          {vendors?.length === 0 && (
            <div className="col-span-full py-20 text-center text-muted-foreground border border-dashed border-border">
              No vendors found matching your criteria.
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
