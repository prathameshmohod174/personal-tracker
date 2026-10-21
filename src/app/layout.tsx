import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAYFRAME — Personal operating system",
  description: "A calm, practical dashboard for focus, deadlines, projects, and weekly reviews."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
