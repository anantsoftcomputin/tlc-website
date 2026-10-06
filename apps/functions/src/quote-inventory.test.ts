import { describe,expect,it } from "vitest";
import type { CartItem } from "@tlc/shared";
import { sameQuoteTotals, storedEvidenceItem, trustedInventoryItem, verifyQuoteInventory, verifySendableQuoteItems } from "./quote-inventory.js";
import type { Firestore, Transaction } from "firebase-admin/firestore";
const item={id:"item",kind:"hotel",source:"hotelbeds",supplierId:"hotelbeds",supplierRef:"offer",dates:{start:"2027-01-01",end:"2027-01-03"},currency:"INR",costPrice:1,sellPrice:200,taxes:[],fetchedAt:"2026-09-01T00:00:00Z"} as unknown as CartItem;
const cached={orgId:"tlc",kind:"hotel",source:"hotelbeds",expiresAt:"2027-01-01T00:00:00Z",fetchedAt:"2026-09-01T00:00:00Z",offer:{offerId:"offer",checkIn:"2027-01-01",checkOut:"2027-01-03",price:{total:120,base:100,taxes:20,currency:"INR"}}};
describe("trusted supplier costs",()=>{
 it("enforces the supplier minimum selling rate",()=>{
   expect(()=>trustedInventoryItem(item,{...cached,offer:{...cached.offer,details:{minimumSellingRate:250}}},"tlc",0)).toThrow(/minimum selling price/);
 });
 it("preserves server supplier identity through quote creation and send, and discards forged manual identity",async()=>{
   const current = { ...cached, expiresAt: new Date(Date.now()+60000).toISOString(), source:"tbo-hotel", request:{destination:"dubai"} };
   const candidate = {...item, source:"tbo-hotel",raw:{provider:"forged"}};
   const transaction = {get:async()=>({data:()=>current})} as unknown as Transaction;
   const database = {collection:()=>({doc:()=>({})})} as unknown as Firestore;
   const [created]=await verifyQuoteInventory(transaction,database,"tlc",[candidate]);
   expect(created.raw).toMatchObject({provider:"tbo-hotel",request:{destination:"dubai"}});
   const [sent]=await verifySendableQuoteItems(transaction,database,"tlc",[created],{verifiedAtCreation:true,maxAgeHours:72});
   expect(sent.raw).toEqual(created.raw);
   expect(trustedInventoryItem({...item,source:"manual",supplierId:"manual",supplierRef:"manual-hotel",raw:{provider:"tbo-hotel"}},undefined,"tlc").raw).toBeUndefined();
 });
 it("replaces browser costs and taxes with the server offer",()=>{const result=trustedInventoryItem(item,cached,"tlc",0);expect(result.costPrice).toBe(120);expect(result.taxes[0].amount).toBe(20);});
 it("rejects stale, cross-tenant and altered-date offers",()=>{expect(()=>trustedInventoryItem(item,cached,"foreign",0)).toThrow();expect(()=>trustedInventoryItem(item,cached,"tlc",Date.parse("2028-01-01"))).toThrow();expect(()=>trustedInventoryItem({...item,dates:{start:"2027-02-01",end:"2027-02-03"}},cached,"tlc",0)).toThrow();});
});
describe("sending verified quotes",()=>{
 const totals={cost:100,sell:120,tax:0,fees:0,discount:0,commission:0,gp:20,marginPct:16.67,currency:"INR"} as const;
 it("compares totals numerically regardless of field order",()=>{const reordered=Object.fromEntries(Object.entries(totals).reverse());expect(sameQuoteTotals({...totals},reordered)).toBe(true);expect(sameQuoteTotals({...totals},{...totals,sell:121})).toBe(false);expect(sameQuoteTotals({...totals},{...totals,currency:"USD"})).toBe(false);});
 it("accepts server-verified prices within the freshness window after the cache expires",()=>{const now=Date.parse("2026-09-02T00:00:00Z");expect(storedEvidenceItem(item,true,72,now)).toBe(item);expect(()=>storedEvidenceItem(item,true,12,now)).toThrow("older than 12 hours");expect(()=>storedEvidenceItem(item,false,72,now)).toThrow("predates");});
});
