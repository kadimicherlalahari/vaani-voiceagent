// In-browser call with the Vaani agent (WebRTC via LiveKit). livekit-client is pinned to 2.17.2 — the version
// Vaani's own embed uses; newer clients (2.22) fail mic negotiation with Vaani's server and the agent goes deaf.
// Same agent, prompt and post-call pipeline as a phone call — used for demos and testing without a phone number.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { apiPost } from "../api";
import { Pill } from "../components/ui";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
type Line = { id: string; who: "agent" | "you"; text: string };

const SCRIPTS = [
  "3BHK in Baner, about 1,200 sq ft, full interiors — kitchen, wardrobes, living room. Need it done by March. I'm the owner. (Then ask: \"roughly how much will it cost?\")",
  "Rented 2BHK in Wakad — want the living room and kitchen redone, no structural changes. Ask if that's possible.",
  "Mera flat Pimple Nilakh mein hai, 3BHK, poora ghar karwana hai. Saturday subah consultation chahiye. (Hindi)",
  "Restaurant in Koregaon Park, 2,000 sq ft — can you design it? (should be declined politely)",
  "I'm an existing client — my designer hasn't replied in 5 days, flat in Viman Nagar. (should escalate)",
];

export default function Talk() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [agentHere, setAgentHere] = useState(false);
  const [needsAudio, setNeedsAudio] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  async function start() {
    setPhase("connecting"); setError(""); setLines([]); setSecs(0); setMuted(false); setAgentHere(false); setNeedsAudio(false);
    let roomName = "";
    try {
      const s = await apiPost<{ token: string; url: string; room: string; session: string }>("/talk", {});
      roomName = s.room;
      setRoom(s.room);
      sessionRef.current = s.session;
      const r = new Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { dtx: false, red: false },
      });
      roomRef.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
      });
      r.on(RoomEvent.ParticipantConnected, () => setAgentHere(true));
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudio(!r.canPlaybackAudio));
      r.registerTextStreamHandler("lk.transcription", async (reader, from) => {
        const id = reader.info.attributes?.["lk.segment_id"] ?? reader.info.id;
        addLine(id, from.identity === r.localParticipant.identity ? "you" : "agent", await reader.readAll());
      });
      r.on(RoomEvent.Disconnected, () => finish(s.room));
      await r.connect(s.url, s.token);
      if (r.remoteParticipants.size > 0) setAgentHere(true);
      await r.startAudio().catch(() => setNeedsAudio(true));
      await r.localParticipant.setMicrophoneEnabled(true);
      setPhase("live");
    } catch (e) {
      setError((e as Error).message.includes("Permission") ? "Microphone permission was blocked — allow it in the browser and try again." : (e as Error).message);
      setPhase("error");
      // Don't leave the Vaani session (and the agent) running after a failed start.
      roomRef.current?.disconnect();
      if (roomName) finish(roomName);
    }
  }

  // Live captions (best-effort): the agent publishes transcript segments; interim updates replace the same line.
  function addLine(id: string, who: Line["who"], text: string) {
    if (!text.trim()) return;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      if (i >= 0) { const next = [...ls]; next[i] = { id, who, text }; return next; }
      return [...ls, { id, who, text }].slice(-40);
    });
  }

  async function finish(roomName: string) {
    const session = sessionRef.current;
    if (!session) return; // already finished
    sessionRef.current = null;
    roomRef.current = null;
    setPhase((p) => (p === "error" ? p : "ended"));
    await apiPost(`/talk/${encodeURIComponent(roomName)}/end`, { session }).catch(() => {});
  }

  const hangUp = () => { roomRef.current?.disconnect(); if (room) finish(room); };
  const toggleMute = async () => {
    const r = roomRef.current; if (!r) return;
    await r.localParticipant.setMicrophoneEnabled(muted); setMuted(!muted);
  };
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl">Talk to the AI front desk</h1>
        <p className="text-sm text-ink-2">A live call with the same Vaani agent that answers the studio phone, through your browser microphone. When you hang up, the call goes through the full pipeline — transcript, Nikhil's rubric, designer handoff on Telegram, calendar, HubSpot — exactly like a phone call.</p>
      </div>

      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <div className={`flex h-24 w-24 items-center justify-center rounded-full text-4xl ${phase === "live" ? "animate-pulse bg-accent/15" : "bg-ink/5"}`}>🎙</div>
        <div className="text-sm">
          {phase === "idle" && "Ready when you are. Use headphones if you can."}
          {phase === "connecting" && "Connecting to the agent…"}
          {phase === "live" && <span className="flex items-center gap-2"><Pill tone="good">Live</Pill><span className="tnum">{mmss}</span>{!agentHere && <span className="text-ink-3">agent joining…</span>}{muted && <Pill tone="warn">muted</Pill>}</span>}
          {phase === "ended" && "Call ended. The agent's summary and the lead appear in about a minute."}
          {phase === "error" && <span className="text-critical">{error}</span>}
        </div>
        <div className="flex gap-2">
          {(phase === "idle" || phase === "ended" || phase === "error") && <button className="btn-primary !px-5 !py-2 text-base" onClick={start}>{phase === "idle" ? "Start call" : "Call again"}</button>}
          {phase === "live" && <>
            {needsAudio && <button className="btn" onClick={() => roomRef.current?.startAudio().then(() => setNeedsAudio(false))}>🔈 Enable sound</button>}
            <button className="btn" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
            <button className="rounded-lg bg-critical px-5 py-2 text-base font-medium text-white" onClick={hangUp}>Hang up</button>
          </>}
        </div>
        {phase === "ended" && <div className="flex gap-2 text-sm"><Link className="btn" to="/calls">See the call →</Link><Link className="btn" to="/leads">See leads →</Link></div>}
        <div ref={audioRef} className="hidden" />
      </div>

      {lines.length > 0 && (
        <div className="card max-h-72 space-y-1.5 overflow-y-auto p-4 text-sm">
          {lines.map((l) => <p key={l.id} className={`rounded-lg px-3 py-1.5 ${l.who === "agent" ? "bg-ink/[0.04]" : "bg-s1/[0.07]"}`}><b className="text-xs text-ink-3">{l.who === "agent" ? "AGENT" : "YOU"}</b> {l.text}</p>)}
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Things to try</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{SCRIPTS.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="mt-3 text-xs text-ink-3">There's no caller ID in the browser, so the agent asks for your number — give a real one if you want the designer's Telegram note to show it.</p>
      </div>
    </div>
  );
}
