import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";
import { useToast } from "@/components/Toast";
import { LoadingState } from "@/components/States";
import type { YoutubeAccount } from "@/types";

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["youtube-accounts"],
    queryFn: async () => (await api.get<YoutubeAccount[]>("/youtube/accounts")).data,
  });

  async function connectYoutube() {
    try {
      const res = await api.get<{ url: string }>("/youtube/oauth/start");
      window.location.href = res.data.url;
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Account and publishing connections.</p>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="text-sm">
          <p className="text-slate-500 dark:text-slate-400">Email</p>
          <p>{user?.email}</p>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">YouTube</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Connect a channel to publish finished videos. Studio only requests upload access via Google OAuth -- it
            never asks for your YouTube password.
          </p>
        </div>

        {isLoading && <LoadingState label="Checking connection..." />}

        {!isLoading && (
          <>
            {accounts?.length ? (
              <ul className="space-y-2">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <span>{a.channelTitle ?? a.channelId ?? "Connected channel"}</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Connected</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No YouTube channel connected yet.</p>
            )}
            <button className="btn-primary" onClick={connectYoutube}>
              Connect a YouTube channel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
