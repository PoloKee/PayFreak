import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "../styles/globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PayRight by NTS Designs | A Tech Corp.",
  description:
    "PayRight — paycheck stubs and bank statements by NTS Designs, A Tech Corp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        />
      </head>
      <body className={`${inter.className} app-shell d-flex flex-column`}>
        <Providers>
          <Header />
          <main className="container page-wrap flex-grow">
            {children}
          </main>
          <Footer />
        </Providers>
        <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" />
      </body>
    </html>
  );
}
