import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Client name → Slack channel ID
// Channels follow the #01-[client] convention in the FireTeam workspace.
const CLIENT_CHANNEL_MAP: Record<string, string> = {
  "Aberlite":      "C0AQHF46NJJ",
  "After.com":     "C056Q7AEHQW",
  "Bambu Earth":   "C085496GT0X",
  "FabFitFun":     "C04RB2RBEQ0",
  "Flewd":         "C0AHK0G1E21",
  "Ground News":   "C09K1EM2S6N",
  "Honeylove":     "C0B4HDR9W2E",
  "Librio":        "C0AKL8WU36X",
  "Mighty Munch":  "C0APYFQGP0V",
  "Oliver Charles":"C0ADQRGRC3Z",
  "Paperlike":     "C050GKY7E3W",
  "Popsmith":      "C0AFYPSHNGN",
  "Radiancy":      "C0A9NKKFUNB",
  "Rejuvia":       "C04HXJTCZHU",
};

export interface SlackMessage {
  ts: string;
  text: string;
  authorName: string;
  isoDate: string;
}

export function useSlackHighlights(clientName: string) {
  const channelId = CLIENT_CHANNEL_MAP[clientName] ?? null;

  return useQuery({
    queryKey: ["slack-highlights", channelId],
    queryFn: async (): Promise<SlackMessage[]> => {
      if (!channelId) return [];
      const { data, error } = await supabase.functions.invoke("fibery-proxy", {
        body: { queryType: "slack-highlights", channelId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return (data?.messages ?? []) as SlackMessage[];
    },
    enabled: !!channelId,
    staleTime: 5 * 60 * 1000,
  });
}
