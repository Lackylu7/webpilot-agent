import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebPilot Agent",
  description: "Browser workflow agent for web research, structured extraction, and cited reports."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
