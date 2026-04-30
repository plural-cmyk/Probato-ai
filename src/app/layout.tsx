import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Probato — AI-Powered Autonomous Testing",
  description:
    "Probato automatically discovers features in your codebase and generates, runs, and maintains end-to-end tests using AI.",
  keywords: [
    "Probato",
    "AI testing",
    "E2E testing",
    "Playwright",
    "automated testing",
    "test generation",
  ],
  authors: [{ name: "Probato" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Probato — AI-Powered Autonomous Testing",
    description: "Clone. Discover. Test. Fix. Ship.",
    url: "https://probato-ai.vercel.app",
    siteName: "Probato",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
