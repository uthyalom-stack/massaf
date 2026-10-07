import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { getBrandingSettings } from "@/lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBrandingSettings();
  const siteName = branding.siteName || "MASSAF";
  const tagline = branding.tagline || "Wellness & Therapy";
  const title = `${siteName} — ${tagline}`;
  const description = `${siteName} connects clients with premier, fully certified and vetted independent massage therapists across North America for in-home and studio sessions.`;

  return {
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description,
    icons: branding.logoUrl
      ? {
          icon: branding.logoUrl,
          apple: branding.logoUrl,
        }
      : {
          icon: "/favicon.ico",
          apple: "/favicon.ico",
        },
    openGraph: {
      title,
      description,
      siteName,
      images: branding.logoUrl ? [{ url: branding.logoUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: branding.logoUrl ? [branding.logoUrl] : [],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
