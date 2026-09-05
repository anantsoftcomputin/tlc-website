import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { destinations, moods, trips } from "../apps/web/src/lib/data.ts";

const apply = process.argv.includes("--apply");
if (!apply) throw new Error("Content seeding requires the explicit --apply flag.");
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail:process.env.FIREBASE_CLIENT_EMAIL, privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const database=getFirestore(app); const orgId=process.env.TLC_ORG_ID||"tlc-vacations"; const actor="phase4-content-migration"; const now=new Date().toISOString();
const categories=[
  {slug:"international-tours",name:"International tours",description:"Thoughtfully arranged journeys beyond India.",image:"/images/destinations/switzerland.jpg",imageAlt:"Swiss mountain landscape"},
  {slug:"india-holidays",name:"India holidays",description:"Distinctive journeys through India’s regions, landscapes and cultures.",image:"/images/destinations/rajasthan.jpg",imageAlt:"Historic architecture in Rajasthan"},
  {slug:"private-tailor-made",name:"Private & tailor-made",description:"Flexible journeys designed around each traveller’s dates, people and pace.",image:"/images/destinations/bali.jpg",imageAlt:"Temple landscape in Bali"},
];
const records=[
  ...destinations.map((item,index)=>({collection:"destinations",id:item.id,data:{...item,status:"published",featured:index<8,sortOrder:(index+1)*10,seo:{title:`${item.name} holidays`,description:item.description.slice(0,170)}}})),
  ...moods.map((item,index)=>({collection:"travelStyles",id:item.slug,data:{...item,id:item.slug,description:`Explore ${item.name.toLowerCase()} holiday ideas and flexible journeys designed around you.`,status:"published",featured:index<6,sortOrder:(index+1)*10,seo:{title:`${item.name} holidays`,description:`Explore TLC ${item.name.toLowerCase()} holiday ideas across India and the world.`}}})),
  ...categories.map((item,index)=>({collection:"tripCategories",id:item.slug,data:{...item,id:item.slug,status:"published",featured:true,sortOrder:(index+1)*10,seo:{title:item.name,description:item.description}}})),
  ...trips.map((item,index)=>({collection:"trips",id:item.id,data:{...item,categorySlugs:[item.destinationSlug==="kerala"||item.destinationSlug==="rajasthan"||item.destinationSlug==="ladakh"?"india-holidays":"international-tours","private-tailor-made"],hotelIds:[],currency:"INR",status:"published",featured:index<6,sortOrder:(index+1)*10,seo:{title:item.title,description:item.summary.slice(0,170)}}})),
];
let created=0,skipped=0; const batch=database.batch();
for(const record of records){const ref=database.collection(record.collection).doc(record.id);const existing=await ref.get();if(existing.exists){skipped++;continue;}batch.set(ref,{...record.data,id:record.id,orgId,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor,publishedAt:now});created++;}
const audit=database.collection("auditLogs").doc();batch.set(audit,{id:audit.id,orgId,actorUid:actor,actorRole:"system",action:"content.phase4.seed",collection:"content",docId:"initial-catalogue",before:null,after:{created,skipped,total:records.length},ts:now,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor});
await batch.commit(); console.log(JSON.stringify({projectId,orgId,created,skipped,total:records.length})); process.exit(0);
