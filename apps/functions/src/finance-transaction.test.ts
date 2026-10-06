import {describe,expect,it} from "vitest";
import {inFinancePeriod} from "./finance-transaction.js";
describe("inclusive finance date boundaries",()=>{it("includes all activity on the closing day",()=>{expect(inFinancePeriod("2026-09-17T23:59:59.999Z","2026-09-01","2026-09-17")).toBe(true);expect(inFinancePeriod("2026-09-18T00:00:00Z","2026-09-01","2026-09-17")).toBe(false);expect(inFinancePeriod("","2026-09-01","2026-09-17")).toBe(false);});});
