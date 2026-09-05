import { ArrowRight, Building2, FolderTree, Images, MapPinned, Palmtree, Sparkles } from "lucide-react";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreContentRepository } from "@/repositories/firebase/firestore-content-repository";

const modules = [
  { collection:"destinations", title:"Destinations", copy:"Countries, regions, experiences and destination landing pages.", icon:MapPinned },
  { collection:"hotels", title:"Hotels & resorts", copy:"Curated stays, room types, meal plans and supplier references.", icon:Building2 },
  { collection:"trips", title:"Tours & packages", copy:"Day-by-day itineraries linked to destinations, hotels and styles.", icon:Palmtree },
  { collection:"travelStyles", title:"Holiday styles", copy:"Honeymoon, family, luxury, adventure and other travel moods.", icon:Sparkles },
  { collection:"tripCategories", title:"Categories", copy:"Flexible catalogue groupings for campaigns and discovery.", icon:FolderTree },
] as const;

export default async function ContentDashboard(){
  const user=await requireAdminUser("content:read"); const content=await new FirestoreContentRepository(user.orgId||"tlc-vacations").dashboard();
  const total=Object.values(content).flat().length; const published=Object.values(content).flat().filter((item)=>item.status==="published").length; const drafts=Object.values(content).flat().filter((item)=>item.status==="draft").length;
  return <><header className="admin-page-head"><div><p className="eyebrow">Website CMS</p><h1>Travel catalogue</h1><p>Manage every destination, stay, package and holiday collection shown across the TLC website.</p></div><span className="admin-count"><Images/>{total} content records</span></header>
    <section className="cms-overview"><article><span>Published</span><b>{published}</b><small>Visible on the website</small></article><article><span>Drafts</span><b>{drafts}</b><small>Waiting for review</small></article><article><span>Featured</span><b>{Object.values(content).flat().filter((item)=>item.featured).length}</b><small>Prioritised in discovery</small></article></section>
    <section className="cms-module-grid">{modules.map(({collection,title,copy,icon:Icon})=>{const records=content[collection];return <Link href={`/admin/content/${collection}`} key={collection}><header><span><Icon/></span><b>{records.length}</b></header><h2>{title}</h2><p>{copy}</p><footer><span>{records.filter((item)=>item.status==="published").length} published</span><ArrowRight/></footer></Link>})}</section></>;
}
