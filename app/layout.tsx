import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { GoogleTagManager } from "@next/third-parties/google";
import CookieConsentManager from "@/components/consent/cookie-consent-manager";
import { buildDefaultConsentScript } from "@/lib/consent/default-consent-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "webioom — Where Websites Bloom.",
    template: "%s | webioom",
  },
  description: "webioom scans your website, shows what needs attention, and helps you resolve supported problems safely.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <GoogleTagManager gtmId="GTM-W55LNGPM" />
      <body className="min-h-full flex flex-col">
        {/*
          Cookie Consent V1 — this MUST render before GoogleTagManager's own
          scripts can execute. next/script's `beforeInteractive` strategy
          guarantees execution before any afterInteractive script
          (GoogleTagManager's own scripts use the afterInteractive default)
          and before page hydration, regardless of where in the tree it is
          declared — see node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md's
          own root-layout example, which places a beforeInteractive Script
          inside <body> exactly like this. Placed inside <body> (rather than
          as a direct child of <html>, sibling to <body>) because <script>
          is not a valid direct child of <html> per the HTML content model —
          the previous placement triggered React's dev-only
          "<html> cannot contain a nested <script>" DOM-nesting warning.
          This is a structural fix only: the before/after-Interactive
          ordering (and therefore Consent Mode default -> GTM initialization
          ordering) is unaffected, since that guarantee comes from the
          `strategy` prop, not from tree position. See
          lib/consent/default-consent-script.ts for the full Consent Mode
          reasoning.
        */}
        <Script
          id="consent-default"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: buildDefaultConsentScript() }}
        />
        {children}
        <CookieConsentManager />
      </body>
    </html>
  );
}
