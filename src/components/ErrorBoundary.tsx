import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  isChunkLoadError,
  reloadForNewVersion,
  reportClientError,
} from "@/lib/clientErrors";

type Props = {
  children: ReactNode;
  /** Clears the error when it changes, e.g. the route path, so moving on recovers. */
  resetKey?: string;
  /** Centre the fallback on an empty screen (used outside the studio layout). */
  fullPage?: boolean;
};

type State = { error: Error | null };

// Catches a crash so the rest of the app stays usable, reports it, and turns a
// missing code chunk after a deploy into a reload instead of a blank screen.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewVersion()) return;
    reportClientError(error, info.componentStack ?? undefined);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const newVersion = isChunkLoadError(error);
    const card = (
      <Card role="alert" className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {newVersion ? "The studio was just updated" : "This page hit a problem"}
          </CardTitle>
          <CardDescription>
            {newVersion
              ? "Reload to get the latest version. Your work is saved on this device."
              : "Your work is saved on this device. Reload to try again, or go back home."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button asChild variant="outline">
            <a href="/home">Go home</a>
          </Button>
        </CardContent>
      </Card>
    );
    return this.props.fullPage ? (
      <div className="mx-auto max-w-lg px-4 pt-16">{card}</div>
    ) : (
      card
    );
  }
}
