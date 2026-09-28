import * as React from "react"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/context/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2, Lock, Mail, ShieldCheck, User } from "lucide-react"

export default function LoginPage() {
  const [, setLocation] = useLocation()
  const { user, login, register } = useAuth()
  
  const searchParams = new URLSearchParams(window.location.search)
  const returnTo = searchParams.get("returnTo") || "/quotes"

  const [mode, setMode] = React.useState<"login" | "register">("login")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [name, setName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (user && user.email) {
      setLocation(returnTo)
    }
  }, [user, setLocation, returnTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      if (mode === "login") {
        const res = await login(email, password)
        if (!res.success) {
          setError(res.error || "Invalid email or password.")
        } else {
          setLocation(returnTo)
        }
      } else {
        const res = await register({ email, password, name, phone })
        if (!res.success) {
          setError(res.error || "Registration failed.")
        } else {
          setLocation(returnTo)
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
        </Link>
        <div className="text-center">
          <Link href="/" className="font-serif text-2xl tracking-tight font-medium text-foreground">
            InteriorLens<span className="text-primary"> AI</span>
          </Link>
          <h2 className="mt-3 text-xl font-semibold text-foreground">
            {mode === "login" ? "Sign in to your account" : "Create your account"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "login"
              ? "Access your quotation archives, breakdown reports, and vendor comparisons."
              : "Save your quotes securely and review past project audits anytime."}
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="border border-border shadow-md bg-white">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="grid grid-cols-2 p-1 bg-muted rounded-lg text-center text-xs font-medium">
              <button
                type="button"
                className={`py-1.5 rounded-md transition-all ${
                  mode === "login"
                    ? "bg-white text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setMode("login")
                  setError(null)
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`py-1.5 rounded-md transition-all ${
                  mode === "register"
                    ? "bg-white text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setMode("register")
                  setError(null)
                }}
              >
                Create Account
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      className="pl-9 h-9 text-xs"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="pl-9 h-9 text-xs"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {mode === "register" && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Phone Number (optional)</label>
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    className="h-9 text-xs"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="pl-9 h-9 text-xs"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {mode === "register" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Minimum 6 characters</p>
                )}
              </div>

              <Button type="submit" className="w-full h-9 text-xs font-medium" disabled={isSubmitting}>
                {isSubmitting
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create Free Account"}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border/70 text-center">
              <p className="text-[11px] text-muted-foreground">
                Don't want to create an account?{" "}
                <Link href="/analysis/new" className="text-primary font-medium hover:underline">
                  Upload Quote as Guest &rarr;
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
