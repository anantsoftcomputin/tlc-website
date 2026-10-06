import {describe,expect,it} from "vitest";
import {historicalTrainingExample} from "./marketing-dataset.js";
const snapshot={version:"event-time-v2",customer:Array(120).fill(0),offer:Array(48).fill(0),capturedAt:"2024-01-01T00:00:00Z",modelTrainingAllowed:true,averageSpend:100};
const input={snapshot,sentAt:"2024-01-01T00:00:01Z",now:"2026-01-01T00:00:00Z",consent:true,conversionAt:"2024-01-03T00:00:00Z",bookings:[{approvedAt:"2024-01-03T00:00:00Z",amount:200}]};
describe("historical training evidence",()=>{
 it("excludes missing snapshots, future features, immature outcomes and withdrawn consent",()=>{expect(historicalTrainingExample({...input,snapshot:undefined})).toBeNull();expect(historicalTrainingExample({...input,snapshot:{...snapshot,capturedAt:"2025-01-01"}})).toBeNull();expect(historicalTrainingExample({...input,consent:false})).toBeNull();expect(historicalTrainingExample({...input,now:"2024-03-01"})).toBeNull();});
 it("trains short-horizon heads after 90 days and masks immature long-horizon labels",()=>{const row=historicalTrainingExample({...input,now:"2024-06-01T00:00:00Z"})!;expect(row.labels).toEqual({propensity:1,travel90:1,churn:null,clv12m:null,upgrade:null});});
 it("uses recorded bookings inside the outcome window",()=>{const row=historicalTrainingExample(input)!;expect(row.labels).toEqual({propensity:1,travel90:1,churn:0,clv12m:0.0002,upgrade:1});expect(historicalTrainingExample({...input,bookings:[{approvedAt:"2025-02-01",amount:9999}]} )!.labels.clv12m).toBe(0);});
});
