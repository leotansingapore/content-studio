// The open brand's channels under the brand switcher (and in the phone More sheet), after Buffer and Later: each
// connected account links to its card on /accounts, then one button to connect another. It reads only the cache
// socialStatus keeps (socialConnect.ts), never the network, and shows only where Social accounts does. Leo's sign-ins
// also see the brand's Telegram chats, from the cache the Telegram card keeps (telegramConnect.ts).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AtSign, Facebook, Instagram, Linkedin, Plus, Send, Video, Youtube, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeProfileId } from "@/lib/profiles";
import { loadChannels, onChannelsChanged, platformName, socialConnectShown, type BrandChannels } from "@/lib/socialConnect";
import { TELEGRAM_CHANNELS_CHANGED, loadTelegramChannels, type BrandTelegram } from "@/lib/telegramConnect";
import { useLeoOnly } from "@/lib/useLeoOnly";

const ICON: Record<string, LucideIcon> = { instagram: Instagram, facebook: Facebook, tiktok: Video, linkedin: Linkedin, youtube: Youtube, threads: AtSign, telegram: Send };
const SHOWN = 4;

/** The open brand's channels as last read on this device (null when never read), redrawn as each read lands. */
export function useBrandChannels(userId: string | null | undefined): BrandChannels | null {
  const [channels, setChannels] = useState(() => loadChannels(userId, activeProfileId(userId)));
  useEffect(() => {
    const read = () => setChannels(loadChannels(userId, activeProfileId(userId)));
    read();
    return onChannelsChanged(read);
  }, [userId]);
  return channels;
}

/** The open brand's Telegram chats as the Telegram card last read them here; null for anyone but Leo or when never read. */
function useTelegramChannels(userId: string | null | undefined): BrandTelegram | null {
  const [chats, setChats] = useState(() => loadTelegramChannels(userId, activeProfileId(userId)));
  useEffect(() => {
    const read = () => setChats(loadTelegramChannels(userId, activeProfileId(userId)));
    read();
    window.addEventListener(TELEGRAM_CHANNELS_CHANGED, read);
    return () => window.removeEventListener(TELEGRAM_CHANNELS_CHANGED, read);
  }, [userId]);
  return chats;
}

export default function ChannelsBlock({ userId, className }: { userId: string | null | undefined; className?: string }) {
  const cache = useBrandChannels(userId);
  const leo = useLeoOnly();
  const telegram = useTelegramChannels(leo ? userId : null);
  if (!socialConnectShown()) return null;
  const list = [...(cache?.channels ?? []), ...(telegram?.channels ?? [])];
  const row = "flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-accent [@media(pointer:coarse)]:min-h-11";
  return (
    <section aria-label="Channels" className={className}>
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Channels</p>
      {cache && list.length === 0 && <p className="px-2 pb-1.5 text-sm text-muted-foreground">No channels yet</p>}
      {list.length > 0 && (
        <ul className="pb-1.5">
          {list.slice(0, SHOWN).map((c, i) => {
            const Icon = ICON[c.platform] ?? AtSign;
            const name = platformName(c.platform);
            const off = c.health === "error" || c.health === "warning";
            return (
              <li key={`${c.platform}-${c.username}-${c.label ?? ""}-${i}`}>
                <Link to={`/accounts#${c.platform}`} className={`${row} text-foreground`}>
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {c.username ? `@${c.username}` : c.label || name}
                    {c.topic && <span className="text-muted-foreground">, {c.topic}</span>}
                  </span>
                  <span className="sr-only"> on {name}</span>
                  {off && (
                    <>
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="sr-only">, needs a look</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
          {list.length > SHOWN && (
            <li>
              <Link to="/accounts" className={`${row} text-muted-foreground hover:text-foreground`}>
                +{list.length - SHOWN} more
              </Link>
            </li>
          )}
        </ul>
      )}
      <Button asChild variant="outline" size="sm" className="h-9 w-full justify-start gap-2 [@media(pointer:coarse)]:h-11">
        <Link to="/accounts">
          <Plus className="h-4 w-4" /> Connect a channel
        </Link>
      </Button>
      {leo && !telegram?.channels.length && (
        <Link to="/accounts#telegram" className={`${row} mt-1 text-muted-foreground hover:text-foreground`}>
          <Send aria-hidden className="h-4 w-4 shrink-0" /> Connect Telegram
        </Link>
      )}
    </section>
  );
}
