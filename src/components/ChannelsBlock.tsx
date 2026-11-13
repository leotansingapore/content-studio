// What is left of the sidebar's Channels block, which moved to Connections (/accounts, 13 Nov): the open brand's
// channels as last read on this device (Home and Analytics), and each network's mark.

import { useEffect, useState } from "react";
import { AtIcon, FacebookLogoIcon, InstagramLogoIcon, LinkedinLogoIcon, PaperPlaneTiltIcon, VideoCameraIcon, YoutubeLogoIcon, type Icon as IconType } from "@phosphor-icons/react";
import { activeProfileId } from "@/lib/profiles";
import { loadChannels, onChannelsChanged, type BrandChannels } from "@/lib/socialConnect";

export const CHANNEL_ICON: Record<string, IconType> = { instagram: InstagramLogoIcon, facebook: FacebookLogoIcon, tiktok: VideoCameraIcon, linkedin: LinkedinLogoIcon, youtube: YoutubeLogoIcon, threads: AtIcon, telegram: PaperPlaneTiltIcon };

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
