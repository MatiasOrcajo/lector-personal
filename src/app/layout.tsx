import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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
    default: "Lector Personal",
    template: "%s · Lector Personal",
  },
  description: "Lector personal de PDF y EPUB",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

/** Aplica el tema guardado antes del primer pintado. Sin esto, quien usa
 *  modo oscuro/sepia veía un destello del tema claro en cada carga, porque
 *  el ThemeProvider recién agrega la clase en un useEffect. */
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("theme");if(m!=="dark"&&m!=="sepia"&&m!=="light"){m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(m!=="light")document.documentElement.classList.add(m)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
