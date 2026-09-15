import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  useEffect(() => {
    document.title = "Not found - Content Studio";
    return () => {
      document.title = "Content Studio";
    };
  }, []);

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <h1 className="font-serif text-xl font-semibold leading-none tracking-tight">
          Page not found
        </h1>
        <CardDescription>
          That route does not match anything in the studio. Try one of the tabs
          above, or jump straight to a section below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild className="gap-1.5">
          <Link to="/generate">Write a post</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/inspiration">Inspiration</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/profiles">Creators</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
