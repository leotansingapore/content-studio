import { useEffect } from "react";
import Inspiration from "@/components/Inspiration";

export default function InspirationPage() {
  useEffect(() => {
    document.title = "Inspiration - Postmosis";
  }, []);
  return <Inspiration />;
}
