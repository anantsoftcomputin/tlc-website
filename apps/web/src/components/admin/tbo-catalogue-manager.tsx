"use client";

import { DownloadCloud, LoaderCircle, Settings2 } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

type Option = { code: string; name: string };
type Providers = { available: { flights: string[]; hotels: string[] }; selected: { flights: string; hotels: string } };

const message = (error: unknown) => (error instanceof Error ? error.message.replace(/^.*?:\s/, "") : "Something went wrong.");

export function TboCatalogueManager({ destinations, canManageProviders }: { destinations: { slug: string; name: string }[]; canManageProviders: boolean }) {
  const router = useRouter();
  const [countries, setCountries] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [country, setCountry] = useState("IN");
  const [cityQuery, setCityQuery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [providers, setProviders] = useState<Providers>();

  useEffect(() => {
    httpsCallable<Record<string, never>, { countries: Option[] }>(getFirebaseFunctions(), "listTboCities")({})
      .then((result) => setCountries(result.data.countries))
      .catch((caught) => setError(message(caught)));
    httpsCallable<Record<string, never>, Providers>(getFirebaseFunctions(), "inventoryProviderStatus")({})
      .then((result) => setProviders(result.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setCities([]);
    if (!country) return;
    httpsCallable<{ countryCode: string }, { cities: Option[] }>(getFirebaseFunctions(), "listTboCities")({ countryCode: country })
      .then((result) => setCities(result.data.cities))
      .catch((caught) => setError(message(caught)));
  }, [country]);

  const matches = cityQuery.trim().length >= 2 ? cities.filter((city) => city.name.toLowerCase().includes(cityQuery.trim().toLowerCase())).slice(0, 30) : [];

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const city = cities.find((item) => item.code === form.get("cityCode"));
    if (!city) { setError("Choose a city from the list."); return; }
    setBusy("sync"); setError(undefined); setNotice(undefined);
    try {
      const result = await httpsCallable<Record<string, unknown>, { imported: number; published: number; drafts: number; preserved: number }>(getFirebaseFunctions(), "syncTboCatalogue")({
        countryCode: country, cityCode: city.code, cityName: city.name,
        destinationSlug: String(form.get("destinationSlug")),
        maxHotels: Number(form.get("maxHotels")), minStars: Number(form.get("minStars")),
        publish: form.get("publish") === "on",
      });
      setNotice(`Imported ${result.data.imported} properties: ${result.data.published} published, ${result.data.drafts} drafts, ${result.data.preserved} kept with staff edits. The website updates within five minutes.`);
      router.refresh();
    } catch (caught) { setError(message(caught)); } finally { setBusy(undefined); }
  }

  async function saveProviders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("providers"); setError(undefined); setNotice(undefined);
    try {
      const selection = { flights: String(form.get("flights")), hotels: String(form.get("hotels")) };
      await httpsCallable(getFirebaseFunctions(), "updateInventoryProviders")(selection);
      setProviders((current) => current && { ...current, selected: selection });
      setNotice("Inventory providers updated. New searches use them immediately.");
    } catch (caught) { setError(message(caught)); } finally { setBusy(undefined); }
  }

  return (
    <>
      {error && <div className="admin-login-error" role="alert">{error}</div>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <section className="admin-panel">
        <header><div><span><DownloadCloud /></span><div><h2>Import a city</h2><p>Stores a range of properties across your chosen star categories, with descriptions, facilities, photos and coordinates for personalised holidays.</p></div></div></header>
        <form className="cms-form" onSubmit={sync}>
          <label><span>Country</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{(countries.length ? countries : [{ code: "IN", name: "India" }]).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label><span>Find city</span><input value={cityQuery} onChange={(event) => setCityQuery(event.target.value)} placeholder={cities.length ? `Search ${cities.length} cities` : "Loading cities…"} /></label>
          <label><span>City</span><select name="cityCode" required>{matches.length ? matches.map((city) => <option key={city.code} value={city.code}>{city.name}</option>) : <option value="">Type at least two letters</option>}</select></label>
          <label><span>Website destination</span><select name="destinationSlug" required>{destinations.length ? destinations.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>) : <option value="">Create a destination first</option>}</select></label>
          <label><span>Minimum stars</span><select name="minStars" defaultValue="3">{[0, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value ? `${value}★ and up` : "Any rating"}</option>)}</select></label>
          <label><span>Properties to import</span><input name="maxHotels" type="number" min={1} max={200} defaultValue={40} /></label>
          <label className="cms-check"><input name="publish" type="checkbox" defaultChecked /><span>Publish properties that have a photo and description</span></label>
          <button className="button primary" disabled={busy === "sync"}>{busy === "sync" ? <LoaderCircle className="spin" /> : <DownloadCloud />}Import from TBO</button>
        </form>
      </section>
      {canManageProviders && providers && (
        <section className="admin-panel">
          <header><div><span><Settings2 /></span><div><h2>Live inventory providers</h2><p>Used by staff inventory search, quote pricing and the price check before sending.</p></div></div></header>
          <form className="cms-form" onSubmit={saveProviders}>
            <label><span>Flights</span><select name="flights" defaultValue={providers.selected.flights}>{providers.available.flights.map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
            <label><span>Hotels</span><select name="hotels" defaultValue={providers.selected.hotels}>{providers.available.hotels.map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
            <button className="button primary" disabled={busy === "providers"}>{busy === "providers" ? <LoaderCircle className="spin" /> : <Settings2 />}Save providers</button>
          </form>
        </section>
      )}
    </>
  );
}
