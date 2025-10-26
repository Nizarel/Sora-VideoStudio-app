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
  const systemThemeScript = `(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (isDark) => {
      const root = document.documentElement;
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };
    applyTheme(mediaQuery.matches);
    const listener = (event) => applyTheme(event.matches);
    mediaQuery.addEventListener ? mediaQuery.addEventListener('change', listener) : mediaQuery.addListener(listener);
  })();`;

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-background text-foreground`}
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
              width={38}
              height={38}
              priority
            />
          </div>
          <strong style={{ fontSize: "1.05rem", color: "var(--brand-green-dark)" }}>
            Starbucks Video Studio
          </strong>
        </header>
        {children}
      </body>
    </html>
  );
}
