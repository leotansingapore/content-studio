import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** notOnAccount: a real page this sign-in can't open (a Leo-only one), so a shared link doesn't read as broken. */
export default function NotFoundPage({ notOnAccount = false }: { notOnAccount?: boolean }) {
  useEffect(() => {
    document.title = `${notOnAccount ? "Not on your account" : "Not found"} - Postmosis`;
  }, [notOnAccount]);

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <h1 className="font-serif text-xl font-semibold leading-none tracking-tight">
          {notOnAccount ? "This page isn't on your account yet" : "Page not found"}
        </h1>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild className="gap-1.5">
          <Link to="/home">Go to Home</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/generate">Write a post</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
