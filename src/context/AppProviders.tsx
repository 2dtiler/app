import type { PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      enableSystem={false}
      storageKey="2dtiler-theme"
      themes={["dark", "light"]}
    >
      {children}
    </ThemeProvider>
  );
}