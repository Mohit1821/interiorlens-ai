import * as React from "react"
import { Link } from "wouter"
import { AppLayout } from "@/components/layout/app-layout"
import { useGetAccount } from "@workspace/api-client-react"
import { useAuth } from "@/context/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Mail, ShieldCheck, LogOut, LogIn } from "lucide-react"

export default function AccountPage() {
  const { user, logout } = useAuth()
  const { data: account, isLoading } = useGetAccount()

  const isGuest = !user?.email

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif mb-2">Account & Profile</h1>
        <p className="text-muted-foreground text-sm">
          {isGuest
            ? "You are currently browsing as a guest. Create an account to preserve your quotation history."
            : "Manage your profile and quotation history preferences."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                {isGuest
                  ? "Guest session information on this browser."
                  : "Your registered InteriorLens AI account credentials."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Account Name</label>
                <div className="font-medium text-foreground">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}` : isGuest ? "Guest User" : "Member"}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
                <div className="font-medium text-foreground">{user?.email || "No email linked (Guest Mode)"}</div>
              </div>

              <div className="pt-4 flex items-center gap-3 border-t border-border">
                {isGuest ? (
                  <Button asChild className="text-xs">
                    <Link href="/login">
                      <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign In / Create Account
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => logout()} className="text-xs text-destructive hover:bg-destructive/10">
                    <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign Out
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="bg-sidebar border-b border-border">
              <CardTitle className="text-base">Current Tier</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-2xl font-serif mb-1 capitalize text-primary">100% Free Public Beta</div>
              <p className="text-sm text-muted-foreground mb-6">Unlimited quotation analyses</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Quotes saved</span>
                  <span className="font-mono">{account?.analysesUsed ?? 0}</span>
                </div>
                <div className="h-2 w-full bg-accent rounded-none">
                  <div className="h-full bg-primary" style={{ width: "100%" }} />
                </div>
              </div>

              <Button asChild className="w-full text-xs">
                <Link href="/analysis/new">Upload Another Quote</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
