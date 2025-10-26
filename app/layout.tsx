import type { Metadata } from "next";
import Image from "next/image";
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

export const metadata: Metadata = {
  title: "Sora Sample App",
  description:
    "Sample frontend for generating videos with the OpenAI Sora models",
  icons: {
    icon: "/sora-2.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Force light mode for Starbucks theme
  const systemThemeScript = `(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  })();`;

  return (
    <html lang="en" className="h-full light" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <script
          dangerouslySetInnerHTML={{ __html: systemThemeScript }}
        />
        {/* Branded header */}
        <header className="header-bar">
          <div className="logo-mark">
            <Image
              src="/starbucks-logo.svg"
              alt="Starbucks"
              width={50}
              height={50}
              priority
            />
          </div>
          <strong>Starbucks Video Studio</strong>
        </header>
        {children}
      </body>
    </html>
  );
}
