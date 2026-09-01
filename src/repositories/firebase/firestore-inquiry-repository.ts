import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { InquiryRepository } from "@/repositories/interfaces/inquiry-repository";

export class FirestoreInquiryRepository implements InquiryRepository {
  async create(input: Parameters<InquiryRepository["create"]>[0], context: Parameters<InquiryRepository["create"]>[1]) {
    const createdAt = new Date().toISOString();
    const document = getAdminFirestore().collection("inquiries").doc();

    await document.set({
      source: input.source,
      customer: {
        fullName: input.fullName,
        phone: input.phone,
        ...(input.email ? { email: input.email } : {}),
        preferredContact: input.preferredContact,
      },
      ...(input.destinationIds?.length ? { destinationIds: input.destinationIds } : {}),
      ...(input.interests?.length ? { interests: input.interests } : {}),
      ...(input.travelMonth ? { travelDates: { month: input.travelMonth, flexible: true } } : {}),
      ...(input.travellerType ? { travellerType: input.travellerType } : {}),
      ...(input.requirements ? { requirements: input.requirements } : {}),
      ...(context.attribution && Object.keys(context.attribution).length ? { utm: context.attribution } : {}),
      status: "new",
      userAgent: context.userAgent?.slice(0, 300) || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { id: document.id, createdAt };
  }
}
