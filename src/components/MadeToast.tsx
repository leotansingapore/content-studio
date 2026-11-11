// One toast, "Your <format> is ready" with Open, when a background make finishes while another page is open
// (madeToast.ts). Mounted once in StudioLayout; it only listens to the jobs Making now lists.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLibraryJobs } from "@/components/library/MakingNow";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { links } from "@/lib/links";
import { madeBetween, pathOf, readyTitle } from "@/lib/madeToast";
import { slideshowJob } from "@/lib/slideshowJob";

export default function MadeToast() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const jobs = useLibraryJobs(links.library());
  const before = useRef(jobs);
  const here = useRef(pathname);
  here.current = pathname;
  useEffect(() => {
    const made = madeBetween(before.current, jobs);
    before.current = jobs;
    // the page a job ran on shows its own result
    const j = made.find((x) => pathOf(x.href) !== here.current);
    if (!j) return;
    const show = j.kind === "slideshow" ? slideshowJob()?.showId : undefined;
    const href = show ? links.slideshow({ s: show }) : j.href;
    toast({ title: readyTitle(j.label), action: <ToastAction altText={`Open ${j.label}`} onClick={() => navigate(href)}>Open</ToastAction> });
  }, [jobs, navigate]);
  return null;
}
