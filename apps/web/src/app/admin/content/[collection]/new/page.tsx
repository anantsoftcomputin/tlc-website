import { notFound } from "next/navigation";
import { contentCollectionSchema } from "@tlc/shared";
import { ContentEditor } from "@/components/admin/content-editor";
import { requireAdminUser } from "@/lib/auth/session";
export default async function NewContentPage({params}:{params:Promise<{collection:string}>}){const parsed=contentCollectionSchema.safeParse((await params).collection);if(!parsed.success)notFound();await requireAdminUser("content:write");return <ContentEditor collection={parsed.data}/>;}
