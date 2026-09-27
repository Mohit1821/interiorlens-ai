import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { useGetAccount } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function AccountPage() {
  const { data: account, isLoading } = useGetAccount()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-8 max-w-2xl">
          <div className="h-10 bg-muted w-1/4" />
          <div className="h-48 bg-muted" />
        </div>
      </AppLayout>
    )
  }

  const usagePercent = account?.analysesLimit 
    ? ((account.analysesUsed || 0) / account.analysesLimit) * 100 
    : 0

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif mb-2">Account Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your workspace and plan preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal information associated with this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Name</label>
                <div className="font-medium">{account?.name}</div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
                <div className="font-medium">{account?.email}</div>
              </div>
              <Button variant="outline" className="mt-4">Edit Profile</Button>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="bg-sidebar border-b border-border">
              <CardTitle className="text-base">Current Plan</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-2xl font-serif mb-1 capitalize text-primary">{account?.plan}</div>
              <p className="text-sm text-muted-foreground mb-6">Active subscription</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Analyses used</span>
                  <span className="font-mono">{account?.analysesUsed} / {account?.analysesLimit}</span>
                </div>
                <div className="h-2 w-full bg-accent rounded-none">
                  <div 
                    className="h-full bg-primary" 
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
              </div>

              <Button className="w-full">Upgrade Plan</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
