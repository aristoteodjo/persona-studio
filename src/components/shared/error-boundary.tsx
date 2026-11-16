import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type State = { error: Error | null };

/** Last line of defense: a crash shows a recovery screen instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("studio crashed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">
          Le studio a rencontré une erreur
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Tes profils sont enregistrés sur le disque et n'ont pas été touchés.
          Recharge le studio pour reprendre.
        </p>
        <pre
          role="alert"
          className="max-w-xl overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground"
        >
          {error.message}
        </pre>
        <Button onClick={() => location.reload()}>Recharger le studio</Button>
      </main>
    );
  }
}
