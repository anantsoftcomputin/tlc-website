import { ArrowRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { contentCollectionSchema, type ContentCollection } from "@tlc/shared";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreContentRepository } from "@/repositories/firebase/firestore-content-repository";

const names:Record<ContentCollection,{title:string;singular:string;copy:string}>={
  destinations:{title:"Destinations",singular:"destination",copy:"Build destination pages with accurate travel guidance and experiences."},
  hotels:{title:"Hotels & resorts",singular:"hotel",copy:"Maintain TLC’s curated accommodation catalogue and supplier mapping."},
  trips:{title:"Tours & packages",singular:"package",copy:"Create flexible itineraries and connect them to destinations and stays."},
  travelStyles:{title:"Holiday styles",singular:"style",copy:"Organise discovery around how customers want to travel."},
  tripCategories:{title:"Categories",singular:"category",copy:"Create reusable product groupings for website discovery and campaigns."},
};
export default async function ContentListPage({params,searchParams}:{params:Promise<{collection:string}>;searchParams:Promise<{q?:string;status?:string}>}){
  const parsed=contentCollectionSchema.safeParse((await params).collection); if(!parsed.success)notFound(); const collection=parsed.data; const user=await requireAdminUser("content:read");
  const [records,query]=await Promise.all([new FirestoreContentRepository(user.orgId||"tlc-vacations").list(collection),searchParams]); const q=query.q?.trim().toLowerCase()||""; const status=query.status||"all";
  const shown=records.filter((item)=>(status==="all"||item.status===status)&&(!q||`${item.name} ${item.subtitle} ${item.slug}`.toLowerCase().includes(q)));
  return <><header className="admin-page-head"><div><p className="eyebrow">Travel catalogue</p><h1>{names[collection].title}</h1><p>{names[collection].copy}</p></div><Link className="button primary" href={`/admin/content/${collection}/new`}><Plus/>New {names[collection].singular}</Link></header>
    <form className="cms-list-toolbar"><label><Search/><input name="q" defaultValue={q} placeholder={`Search ${names[collection].title.toLowerCase()}`}/></label><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select><button>Filter</button><span>{shown.length} of {records.length}</span></form>
    <section className="admin-panel"><div className="cms-list">{shown.map((item)=><Link href={`/admin/content/${collection}/${item.id}`} key={item.id}><span className="cms-list-image">{item.image?<Image src={item.image} alt="" width={96} height={96}/>:<span>{item.name.charAt(0)}</span>}</span><div><b>{item.name}</b><small>{item.subtitle||item.slug}</small><code>/{item.slug}</code></div><span className={`status-pill status-${item.status}`}>{item.status}</span>{item.featured&&<em>Featured</em>}<time>{item.updatedAt?new Intl.DateTimeFormat("en-IN",{dateStyle:"medium"}).format(new Date(item.updatedAt)):"Not saved"}</time><ArrowRight/></Link>)}{!shown.length&&<div className="admin-empty"><span>0</span><h3>No matching content</h3><p>Create the first record or adjust your search and status filter.</p></div>}</div></section></>;
}
