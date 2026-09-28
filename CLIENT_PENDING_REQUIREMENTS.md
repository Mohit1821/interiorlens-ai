# InteriorLens AI — Production Readiness & Client Requirements Report

**Deployment URL:** [https://interiorlensai.snedanfrancis.in](https://interiorlensai.snedanfrancis.in)  
**Date:** September 28, 2026  
**Status:** Frontend & Backend Deployed & Online (503 Resolved, Supabase DB Connected)

---

## Executive Summary

The **InteriorLens AI** web platform is now successfully compiled and running live in production on Hostinger. The database schema has been provisioned on Supabase PostgreSQL (11 tables active).

However, because this codebase was originally an internal prototype built for the Replit development platform, several **third-party integrations, external API credentials, and platform dependencies** must be configured before paying customers can upload quotes and receive automated AI analysis reports.

---

## 1. Critical Blockers (Required for Core Quote Analysis to Work)

### 1.1. AI Extraction & Report Engine (Anthropic Claude or Google Gemini)
* **Current State:** The backend requires an AI API key to parse uploaded quotation PDFs/images, categorize line items (carpentry, electrical, civil, painting), calculate market benchmark discrepancies, and generate the final report.
* **Missing Variable:** `ANTHROPIC_API_KEY`
* **What is Needed From Client:**
  * **Option A (Recommended):** Provide an **Anthropic Claude API Key** (`sk-ant-...`) from [console.anthropic.com](https://console.anthropic.com/). (Claude 3.5 Sonnet / Opus is the native engine programmed into this codebase).
  * **Option B (Free Alternative):** If the client wants a 100% free AI tier, we can integrate **Google Gemini 2.5 Flash** (`GEMINI_API_KEY`) via Google AI Studio, which provides generous permanent free tiers.

---

### 1.2. File Storage for Quotation Uploads (PDFs / Images)
* **Current State:** The original code relied on Replit's internal Google Cloud sidecar (`http://127.0.0.1:1106`), which does not exist on external hosting servers. When users upload quotes, the upload request will fail until storage is redirected.
* **Solution:** Connect **Supabase Storage** (or local server file storage).
* **What is Needed From Client:**
  * Create a bucket named `quotations` in the Supabase Dashboard under **Storage**.
  * Grant permission to connect Supabase Storage using the Supabase Project URL and Service Role Key:
    * `SUPABASE_URL`: `https://vmrzjmkharvizpwdbtpi.supabase.co`
    * `SUPABASE_SERVICE_ROLE_KEY`: *(From Supabase Project Settings -> API)*

---

### 1.3. User Authentication & Login System
* **Current State:** The "Sign in" and "Analyse Quote" flows redirect users to Replit's single sign-on (`https://replit.com/oidc`), which blocks external public visitors with an error.
* **What is Needed From Client (Decision Required):**
  * **Option 1 (Instant / Zero-Friction):** Allow **Guest / Anonymous Quote Uploads** — visitors enter their email or phone number and immediately receive their quotation report without passwords.
  * **Option 2:** Connect **Supabase Auth / Google Sign-in** — standard Google 1-click login and Email Magic Link login.

---

### 1.4. Server-Side PDF Parser Compatibility
* **Current State:** The extraction worker attempts to invoke the Linux command-line tool `pdftotext` (`poppler-utils`). On shared hosting servers like Hostinger, native command-line utilities are restricted.
* **Development Action:** We will replace the native `pdftotext` shell call with a pure Node.js PDF extractor (`pdf-parse`) or Claude Vision direct document stream so PDF processing works seamlessly on any host.

---

## 2. Vendor Intelligence & Background Checks (Optional but Recommended)

When reviewing quotations, the platform provides vendor credibility and risk-checking features:

| Integration | Required Env Variable | Purpose | How to Get / Cost |
| :--- | :--- | :--- | :--- |
| **Serper.dev** | `SERPER_API_KEY` | Searches Google for consumer court complaints, cheating/fraud reports, and refund disputes against the interior designer. | **Free Tier:** 2,500 free queries at [serper.dev](https://serper.dev) (no credit card required). |
| **Google Places (New)** | `GOOGLE_MAPS_API_KEY` | Fetches Google Maps business ratings, verified address, and review counts for the vendor. | **Free Tier:** Google Cloud provides **$200/month recurring free credit**. |

*Note: If these keys are omitted, quote pricing analysis will still work, but vendor background checks will display as "Data unavailable".*

---

## 3. Commercial & Payment Setup (Pricing Page)

* **Current State:** The `/pricing` page displays two tiers:
  * **Standard:** $49/mo (Homeowner)
  * **Pro Workspace:** $199/mo (Architects / Contractors)
  * Currently, the **"Select Standard"** and **"Start Pro Trial"** buttons are visual placeholders with no payment gateway attached.
* **What is Needed From Client:**
  * Which payment gateway should be integrated?
    * **India:** Razorpay or Cashfree (supports UPI, NetBanking, Cards).
    * **International:** Stripe (supports Credit Cards, Apple Pay).
  * API Keys (Public Key, Secret Key, and Webhook Secret) for the selected gateway.

---

## 4. Legal, Compliance & Email Communication

* **Terms & Privacy Pages:** In the footer, "Privacy" and "Terms" currently link to placeholder routes. The client should provide real Privacy Policy and Terms of Service documents.
* **Transactional Email Service:** If quotation reports should be automatically emailed to homeowners as PDF attachments, an email service (such as Resend, SendGrid, or Hostinger SMTP) is needed:
  * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

---

## 5. Checklist: What to Collect From the Client

Please share this checklist with the client to finalize production:

- [ ] **AI Engine API Key:**
  - `ANTHROPIC_API_KEY` (Anthropic Claude) **OR** `GEMINI_API_KEY` (Google Gemini)
- [ ] **Supabase Service Key (for Storage):**
  - Found under *Supabase Dashboard -> Project Settings -> API -> `service_role` secret*
- [ ] **Vendor Check Keys (Free Tiers):**
  - `SERPER_API_KEY` (from [serper.dev](https://serper.dev))
  - `GOOGLE_MAPS_API_KEY` (from Google Cloud Console)
- [ ] **Auth Preference:**
  - Guest Upload (No login required) **OR** Google / Email Login via Supabase Auth
- [ ] **Payment Gateway (if charging customers):**
  - Razorpay or Stripe API keys
- [ ] **Support & Notification Email:**
  - Official sender email (e.g. `support@snedanfrancis.in`)

---

*Report prepared by Antigravity Engineering Assistant.*
