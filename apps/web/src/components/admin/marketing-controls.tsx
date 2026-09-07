"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Play,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

function message(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/, "")
    : "The action could not be completed.";
}

export function MarketingAction({
  name,
  data,
  children,
  confirm,
  tone = "secondary",
}: {
  name: string;
  data: Record<string, unknown>;
  children: ReactNode;
  confirm?: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError("");
    try {
      await httpsCallable(getFirebaseFunctions(), name)(data);
      router.refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="marketing-action-wrap">
      <button className={`button ${tone}`} disabled={busy} onClick={run}>
        {busy ? (
          <LoaderCircle className="spin" />
        ) : name.includes("approve") ? (
          <Check />
        ) : name.includes("send") ? (
          <Send />
        ) : (
          <Play />
        )}
        {children}
      </button>
      {error && (
        <small className="form-error">
          <AlertTriangle />
          {error}
        </small>
      )}
    </span>
  );
}

export function OfferBuilder() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await httpsCallable(
        getFirebaseFunctions(),
        "saveMarketingOffer",
      )({
        title: form.get("title"),
        type: form.get("type"),
        destinations: String(form.get("destinations") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        priceBand: form.get("priceBand"),
        validity: { start: form.get("start"), end: form.get("end") },
        inventory: {
          mode: form.get("inventoryMode"),
          available: form.get("available")
            ? Number(form.get("available"))
            : undefined,
          source: form.get("source"),
          fetchedAt: new Date().toISOString(),
        },
        exclusive: form.get("exclusive") === "on",
        targetingRules: {},
        content: {
          whatsappTemplate:
            String(form.get("whatsappTemplate") || "") || undefined,
          landingSlug: form.get("landingSlug"),
        },
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-panel marketing-builder" onSubmit={submit}>
      <header>
        <div>
          <span>
            <Sparkles />
          </span>
          <div>
            <h2>Create an offer</h2>
            <p>Drafts require manager approval before activation or scoring.</p>
          </div>
        </div>
      </header>
      <div className="marketing-form-grid">
        <label className="span-2">
          <span>Offer title</span>
          <input
            name="title"
            minLength={2}
            required
            placeholder="Monsoon escape to Kerala"
          />
        </label>
        <label>
          <span>Offer type</span>
          <select name="type" defaultValue="package">
            <option>package</option>
            <option>hotel</option>
            <option>flight</option>
            <option>cruise</option>
            <option>experience</option>
            <option>other</option>
          </select>
        </label>
        <label>
          <span>Price band</span>
          <select name="priceBand" defaultValue="premium">
            <option>budget</option>
            <option>mid</option>
            <option>premium</option>
            <option>luxury</option>
          </select>
        </label>
        <label className="span-2">
          <span>Destinations</span>
          <input
            name="destinations"
            required
            placeholder="Kochi, Munnar, Alleppey"
          />
          <small>Separate destinations with commas.</small>
        </label>
        <label>
          <span>Valid from</span>
          <input
            type="date"
            name="start"
            min={today}
            defaultValue={today}
            required
          />
        </label>
        <label>
          <span>Valid until</span>
          <input type="date" name="end" min={today} required />
        </label>
        <label>
          <span>Inventory mode</span>
          <select name="inventoryMode" defaultValue="onRequest">
            <option value="onRequest">On request</option>
            <option value="allocation">Allocation</option>
            <option value="liveAdapter">Live adapter</option>
          </select>
        </label>
        <label>
          <span>Available units</span>
          <input
            type="number"
            name="available"
            min="0"
            placeholder="Optional"
          />
        </label>
        <label>
          <span>Inventory source</span>
          <input name="source" required defaultValue="TLC contracting" />
        </label>
        <label>
          <span>Landing-page slug</span>
          <input
            name="landingSlug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="kerala-monsoon-escape"
          />
        </label>
        <label className="span-2">
          <span>WhatsApp template name</span>
          <input
            name="whatsappTemplate"
            placeholder="Optional approved Meta template"
          />
        </label>
        <label className="check-label span-2">
          <input type="checkbox" name="exclusive" />
          TLC exclusive offer
        </label>
      </div>
      <footer>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : <Save />}Save draft
        </button>
        {error && (
          <small className="form-error">
            <AlertTriangle />
            {error}
          </small>
        )}
      </footer>
    </form>
  );
}

export function CampaignBuilder({
  offers,
}: {
  offers: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [campaignTrigger, setCampaignTrigger] = useState("manual");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const trigger = String(form.get("trigger"));
    const sendAt = String(form.get("sendAt") || "");
    try {
      await httpsCallable(
        getFirebaseFunctions(),
        "saveMarketingCampaign",
      )({
        offerId: form.get("offerId"),
        name: form.get("name"),
        channel: form.get("channel"),
        trigger,
        audience: {
          segmentLabels: String(form.get("segments") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          customerIds: [],
          propensityMin: Number(form.get("propensityMin") || 60),
        },
        schedule: {
          ...(trigger === "scheduled" && sendAt
            ? { sendAt: new Date(sendAt).toISOString() }
            : {}),
          timezone: "Asia/Kolkata",
        },
        message: {
          subject: String(form.get("subject") || "") || undefined,
          body: form.get("body"),
          templateName: String(form.get("templateName") || "") || undefined,
        },
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!offers.length)
    return (
      <div className="admin-empty compact">
        <AlertTriangle />
        <b>An active offer is required</b>
        <p>Approve and activate an offer before building a campaign.</p>
      </div>
    );
  return (
    <form className="admin-panel marketing-builder" onSubmit={submit}>
      <header>
        <div>
          <span>
            <Send />
          </span>
          <div>
            <h2>Build a governed campaign</h2>
            <p>
              Create the audience and message, then submit it for manager
              approval.
            </p>
          </div>
        </div>
      </header>
      <div className="marketing-form-grid">
        <label>
          <span>Campaign name</span>
          <input name="name" required />
        </label>
        <label>
          <span>Active offer</span>
          <select name="offerId">
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Channel</span>
          <select
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label>
          <span>Minimum propensity</span>
          <input
            name="propensityMin"
            type="number"
            min="0"
            max="100"
            defaultValue="60"
          />
        </label>
        <label className="span-2">
          <span>Segment labels</span>
          <input name="segments" placeholder="family, premium, repeat" />
          <small>
            Leave empty to include every scored, consenting customer above the
            threshold.
          </small>
        </label>
        <label>
          <span>Trigger</span>
          <select
            name="trigger"
            value={campaignTrigger}
            onChange={(event) => setCampaignTrigger(event.target.value)}
          >
            <option value="manual">Manual send</option>
            <option value="scheduled">Scheduled after approval</option>
          </select>
        </label>
        <label>
          <span>Schedule time</span>
          <input
            type="datetime-local"
            name="sendAt"
            required={campaignTrigger === "scheduled"}
          />
        </label>
        <label>
          <span>Email subject</span>
          <input
            name="subject"
            required={channel === "email"}
            placeholder="Required for email"
          />
        </label>
        <label>
          <span>Approved template</span>
          <input
            name="templateName"
            required={channel === "whatsapp"}
            placeholder="Required for WhatsApp"
          />
        </label>
        <label className="span-2">
          <span>Message</span>
          <textarea name="body" rows={5} required maxLength={5000} />
        </label>
      </div>
      <footer>
        <button className="button primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : <Save />}Save campaign
          draft
        </button>
        {error && (
          <small className="form-error">
            <AlertTriangle />
            {error}
          </small>
        )}
      </footer>
    </form>
  );
}
