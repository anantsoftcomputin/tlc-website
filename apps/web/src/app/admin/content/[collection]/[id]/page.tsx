import { notFound } from "next/navigation";
import { contentCollectionSchema } from "@tlc/shared";
import { ContentEditor } from "@/components/admin/content-editor";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreContentRepository } from "@/repositories/firebase/firestore-content-repository";
export default async function EditContentPage({params}:{params:Promise<{collection:string;id:string}>}){const values=await params;const parsed=contentCollectionSchema.safeParse(values.collection);if(!parsed.success)notFound();const user=await requireAdminUser("content:write");const record=await new FirestoreContentRepository(user.orgId||"tlc-vacations").get(parsed.data,values.id);if(!record)notFound();return <ContentEditor collection={parsed.data} initial={record}/>;}
