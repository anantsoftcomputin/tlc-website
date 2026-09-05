"use client";

import { ArrowLeft, Check, ExternalLink, ImagePlus, LoaderCircle, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { ContentCollection } from "@tlc/shared";

const labels: Record<ContentCollection, { singular:string; plural:string }> = {
  destinations:{ singular:"Destination", plural:"Destinations" }, hotels:{ singular:"Hotel", plural:"Hotels" },
  travelStyles:{ singular:"Holiday style", plural:"Holiday styles" }, tripCategories:{ singular:"Category", plural:"Categories" },
  trips:{ singular:"Tour package", plural:"Tour packages" },
};
function value(record:Record<string,unknown>, key:string, fallback="") { const result=record[key]; return result === undefined || result === null ? fallback : String(result); }
function lines(record:Record<string,unknown>, key:string) { return Array.isArray(record[key]) ? (record[key] as unknown[]).map((item) => typeof item === "string" ? item : "").filter(Boolean).join("\n") : ""; }
function objectLines(record:Record<string,unknown>, key:string, fields:string[]) { return Array.isArray(record[key]) ? (record[key] as Record<string,unknown>[]).map((item) => fields.map((field) => String(item[field] ?? "")).join(" | ")).join("\n") : ""; }
const list = (form:FormData, key:string) => String(form.get(key) || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export function ContentEditor({ collection, initial = {} }: { collection:ContentCollection; initial?:Record<string,unknown> }) {
  const router=useRouter(); const fileRef=useRef<HTMLInputElement>(null);
  const [image,setImage]=useState(value(initial,"image")); const [busy,setBusy]=useState(""); const [error,setError]=useState(""); const [saved,setSaved]=useState(false);
  const isNew=!initial.id; const title=labels[collection].singular;
  const preview = collection === "trips" ? `/trips/${value(initial,"slug")}` : collection === "destinations" ? `/destinations/${value(initial,"slug")}` : collection === "travelStyles" ? `/holidays/${value(initial,"slug")}` : "";

  async function upload() {
    const file=fileRef.current?.files?.[0]; if(!file) return;
    setBusy("upload"); setError(""); const body=new FormData(); body.set("file",file);
    try { const response=await fetch("/api/admin/media",{method:"POST",body}); const result=await response.json(); if(!response.ok) throw new Error(result.error||"Upload failed."); setImage(result.url); }
    catch(cause){ setError(cause instanceof Error?cause.message:"Upload failed."); } finally { setBusy(""); }
  }
  function common(form:FormData) { return {
    id:initial.id ? String(initial.id) : undefined, slug:String(form.get("slug")||""),
    image, imageAlt:String(form.get("imageAlt")||""), status:String(form.get("status")||"draft"),
    featured:form.get("featured")==="on", sortOrder:Number(form.get("sortOrder")||100),
    seo:{ title:String(form.get("seoTitle")||""), description:String(form.get("seoDescription")||"") },
  }; }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("save"); setError(""); setSaved(false); const form=new FormData(event.currentTarget); const base=common(form); let data:Record<string,unknown>;
    if(collection==="destinations") data={...base,name:String(form.get("name")||""),country:String(form.get("country")||""),region:String(form.get("region")||"international"),tagline:String(form.get("tagline")||""),description:String(form.get("description")||""),overview:String(form.get("overview")||""),photoLocation:String(form.get("photoLocation")||""),bestTime:String(form.get("bestTime")||""),idealDuration:String(form.get("idealDuration")||""),styles:list(form,"styles"),experiences:String(form.get("experiences")||"").split("\n").filter(Boolean).map((row)=>{const [title,...note]=row.split("|");return {title:title.trim(),note:note.join("|").trim()};})};
    else if(collection==="hotels") data={...base,name:String(form.get("name")||""),destinationSlug:String(form.get("destinationSlug")||""),location:String(form.get("location")||""),starRating:Number(form.get("starRating")||5),priceBand:String(form.get("priceBand")||"premium"),summary:String(form.get("summary")||""),gallery:list(form,"gallery"),amenities:list(form,"amenities"),styleSlugs:list(form,"styleSlugs"),roomTypes:list(form,"roomTypes"),mealPlans:list(form,"mealPlans"),supplierRef:String(form.get("supplierRef")||"")};
    else if(collection==="travelStyles") data={...base,name:String(form.get("name")||""),note:String(form.get("note")||""),description:String(form.get("description")||"")};
    else if(collection==="tripCategories") data={...base,name:String(form.get("name")||""),description:String(form.get("description")||"")};
    else data={...base,title:String(form.get("title")||""),destination:String(form.get("destination")||""),destinationSlug:String(form.get("destinationSlug")||""),summary:String(form.get("summary")||""),days:Number(form.get("days")||1),nights:Number(form.get("nights")||0),route:list(form,"route"),styles:list(form,"styles"),categorySlugs:list(form,"categorySlugs"),hotelIds:list(form,"hotelIds"),idealFor:list(form,"idealFor"),itinerary:String(form.get("itinerary")||"").split("\n").filter(Boolean).map((row)=>{const [day,title,...description]=row.split("|");return {day:Number(day),title:title.trim(),description:description.join("|").trim()};}),inclusions:list(form,"inclusions"),startingPrice:form.get("startingPrice")?Number(form.get("startingPrice")):undefined,currency:"INR"};
    try { const response=await fetch("/api/admin/content",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({collection,data})}); const result=await response.json(); if(!response.ok) throw new Error(result.error||"Content could not be saved."); setSaved(true); if(isNew) router.replace(`/admin/content/${collection}/${result.id}`); router.refresh(); }
    catch(cause){ setError(cause instanceof Error?cause.message:"Content could not be saved."); } finally { setBusy(""); }
  }
  async function archive(){ if(!initial.id||!window.confirm(`Archive this ${title.toLowerCase()}? It will be removed from the public website.`))return; setBusy("archive"); const response=await fetch("/api/admin/content",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({collection,id:initial.id})}); if(response.ok){router.push(`/admin/content/${collection}`);router.refresh();}else{const result=await response.json();setError(result.error||"Archive failed.");setBusy("");}}

  const seo=(initial.seo||{}) as Record<string,unknown>;
  return <form className="cms-editor" onSubmit={submit}>
    <header className="cms-editor-head"><div><Link className="admin-back" href={`/admin/content/${collection}`}><ArrowLeft/>{labels[collection].plural}</Link><p className="eyebrow">{isNew?"Create":"Edit"} {title.toLowerCase()}</p><h1>{isNew?`New ${title.toLowerCase()}`:value(initial,"name",value(initial,"title"))}</h1><p>Complete the editorial details, then save as a draft or publish when it is ready.</p></div><div>{preview&&initial.status==="published"&&<a className="button secondary" href={preview} target="_blank" rel="noreferrer">Preview<ExternalLink/></a>}<button className="button primary" disabled={Boolean(busy)}>{busy==="save"?<LoaderCircle className="spin"/>:<Save/>}Save content</button></div></header>
    {error&&<p className="lead-form-error" role="alert">{error}</p>}{saved&&<p className="lead-form-success"><Check/>Saved successfully. Published changes can take up to five minutes to refresh on cached public pages.</p>}
    <div className="cms-editor-layout"><main>
      <section className="cms-form-card"><header><span>01</span><div><h2>Core information</h2><p>The title, URL and customer-facing description.</p></div></header><div className="cms-fields">
        {collection==="trips"?<Field name="title" label="Package title" initial={value(initial,"title")} required/>:<Field name="name" label={`${title} name`} initial={value(initial,"name")} required/>}
        <Field name="slug" label="URL slug" initial={value(initial,"slug")} required hint="Lowercase words separated with hyphens"/>
        {collection==="destinations"&&<><Field name="country" label="Country" initial={value(initial,"country")} required/><Select name="region" label="Region" initial={value(initial,"region","international")} options={["international","india"]}/><Field wide name="tagline" label="Short tagline" initial={value(initial,"tagline")} required/><Area name="description" label="Card description" initial={value(initial,"description")} required/><Area name="overview" label="Destination overview" initial={value(initial,"overview")} required/></>}
        {collection==="hotels"&&<><Field name="destinationSlug" label="Destination slug" initial={value(initial,"destinationSlug")} required/><Field name="location" label="Location" initial={value(initial,"location")} required/><Field name="starRating" label="Star rating" type="number" initial={value(initial,"starRating","5")} required/><Select name="priceBand" label="Price band" initial={value(initial,"priceBand","premium")} options={["budget","mid","premium","luxury"]}/><Area name="summary" label="Hotel summary" initial={value(initial,"summary")} required/></>}
        {collection==="travelStyles"&&<><Field wide name="note" label="Short inspiration line" initial={value(initial,"note")} required/><Area name="description" label="Style description" initial={value(initial,"description")}/></>}
        {collection==="tripCategories"&&<Area name="description" label="Category description" initial={value(initial,"description")} required/>}
        {collection==="trips"&&<><Field name="destination" label="Destination name" initial={value(initial,"destination")} required/><Field name="destinationSlug" label="Destination slug" initial={value(initial,"destinationSlug")} required/><Field name="days" label="Days" type="number" initial={value(initial,"days","7")} required/><Field name="nights" label="Nights" type="number" initial={value(initial,"nights","6")} required/><Field name="startingPrice" label="Starting price (INR)" type="number" initial={value(initial,"startingPrice")}/><Area name="summary" label="Package summary" initial={value(initial,"summary")} required/></>}
      </div></section>
      {(collection==="destinations"||collection==="hotels"||collection==="trips")&&<section className="cms-form-card"><header><span>02</span><div><h2>Travel details</h2><p>Structured details used across discovery and sales.</p></div></header><div className="cms-fields">
        {collection==="destinations"&&<><Field name="photoLocation" label="Photo location" initial={value(initial,"photoLocation")}/><Field name="bestTime" label="Best time to visit" initial={value(initial,"bestTime")} required/><Field name="idealDuration" label="Ideal duration" initial={value(initial,"idealDuration")} required/><Lines name="styles" label="Holiday styles" initial={lines(initial,"styles")}/><Area name="experiences" label="Experiences" initial={objectLines(initial,"experiences",["title","note"])} hint="One per line: Title | Description"/></>}
        {collection==="hotels"&&<><Lines name="amenities" label="Amenities" initial={lines(initial,"amenities")}/><Lines name="styleSlugs" label="Holiday style slugs" initial={lines(initial,"styleSlugs")}/><Lines name="roomTypes" label="Room types" initial={lines(initial,"roomTypes")}/><Lines name="mealPlans" label="Meal plans" initial={lines(initial,"mealPlans")}/><Field name="supplierRef" label="Internal supplier reference" initial={value(initial,"supplierRef")}/><Lines name="gallery" label="Gallery image URLs" initial={lines(initial,"gallery")}/></>}
        {collection==="trips"&&<><Lines name="route" label="Route stops" initial={lines(initial,"route")}/><Lines name="styles" label="Holiday styles" initial={lines(initial,"styles")}/><Lines name="categorySlugs" label="Category slugs" initial={lines(initial,"categorySlugs")}/><Lines name="hotelIds" label="Linked hotel IDs" initial={lines(initial,"hotelIds")}/><Lines name="idealFor" label="Ideal for" initial={lines(initial,"idealFor")}/><Area name="itinerary" label="Day-by-day itinerary" initial={objectLines(initial,"itinerary",["day","title","description"])} hint="One per line: Day number | Title | Description"/><Lines name="inclusions" label="Inclusions" initial={lines(initial,"inclusions")}/></>}
      </div></section>}
      <section className="cms-form-card"><header><span>{collection==="travelStyles"||collection==="tripCategories"?"02":"03"}</span><div><h2>Search and sharing</h2><p>Help customers understand the page before they open it.</p></div></header><div className="cms-fields"><Field wide name="seoTitle" label="SEO title" initial={value(seo,"title")} hint="Recommended: up to 60 characters"/><Area name="seoDescription" label="SEO description" initial={value(seo,"description")} hint="Recommended: up to 160 characters"/></div></section>
    </main><aside>
      <section className="cms-publish-card"><h2>Publishing</h2><Select name="status" label="Visibility" initial={value(initial,"status","draft")} options={["draft","published","archived"]}/><label className="cms-check"><input type="checkbox" name="featured" defaultChecked={Boolean(initial.featured)}/><span><b>Feature this content</b><small>Prioritise it in website discovery.</small></span></label><Field name="sortOrder" label="Display order" type="number" initial={value(initial,"sortOrder","100")}/></section>
      <section className="cms-media-card"><h2>Primary image</h2>{image?<Image src={image} alt="Selected content preview" width={520} height={300}/>:<div><ImagePlus/><span>No image selected</span></div>}<input name="image" value={image} onChange={(event)=>setImage(event.target.value)} placeholder="/images/example.jpg or HTTPS URL" required/><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif"/><button type="button" disabled={Boolean(busy)} onClick={upload}>{busy==="upload"?<LoaderCircle className="spin"/>:<ImagePlus/>}Upload image</button><Field name="imageAlt" label="Accessible image description" initial={value(initial,"imageAlt")} required/></section>
      {!isNew&&<button type="button" className="cms-archive" disabled={Boolean(busy)} onClick={archive}><Trash2/>Archive {title.toLowerCase()}</button>}
    </aside></div>
  </form>;
}

function Field({name,label,initial,type="text",required=false,wide=false,hint}:{name:string;label:string;initial:string;type?:string;required?:boolean;wide?:boolean;hint?:string}){return <label className={wide?"wide":""}><span>{label}{required?" *":""}</span><input name={name} type={type} defaultValue={initial} required={required}/>{hint&&<small>{hint}</small>}</label>}
function Area({name,label,initial,required=false,hint}:{name:string;label:string;initial:string;required?:boolean;hint?:string}){return <label className="wide"><span>{label}{required?" *":""}</span><textarea name={name} defaultValue={initial} required={required} rows={5}/>{hint&&<small>{hint}</small>}</label>}
function Lines(props:{name:string;label:string;initial:string}){return <Area {...props} hint="Enter one item per line"/>}
function Select({name,label,initial,options}:{name:string;label:string;initial:string;options:string[]}){return <label><span>{label}</span><select name={name} defaultValue={initial}>{options.map((option)=><option key={option} value={option}>{option.replaceAll(/([A-Z])/g," $1").replace(/^./,(letter)=>letter.toUpperCase())}</option>)}</select></label>}
