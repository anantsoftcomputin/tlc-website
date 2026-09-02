import { toJSONSchema } from "zod";
import { describe, expect, it } from "vitest";
import { schemaCatalog } from "./schema-catalog.js";

function fieldsFor(schema: unknown): Set<string> {
  const json = schema as { properties?: Record<string, unknown>; allOf?: unknown[] };
  const fields = new Set(Object.keys(json.properties || {}));
  for (const part of json.allOf || []) fieldsFor(part).forEach((field) => fields.add(field));
  return fields;
}

describe("schema catalog invariants", () => {
  it("uses organization isolation on every business collection", () => {
    for (const entry of schemaCatalog.filter((item) => item.orgScoped)) {
      const fields = fieldsFor(toJSONSchema(entry.schema, { unrepresentable: "any" }));
      expect(fields.has("orgId"), `${entry.collection} must include orgId`).toBe(true);
    }
  });

  it("carries canonical audit fields on every document", () => {
    for (const entry of schemaCatalog) {
      const fields = fieldsFor(toJSONSchema(entry.schema, { unrepresentable: "any" }));
      for (const field of ["createdAt", "updatedAt", "createdBy", "updatedBy"]) {
        expect(fields.has(field), `${entry.collection} must include ${field}`).toBe(true);
      }
    }
  });

  it("does not expose plaintext passport fields", () => {
    for (const entry of schemaCatalog) {
      const fields = fieldsFor(toJSONSchema(entry.schema, { unrepresentable: "any" }));
      expect(fields.has("passportNumber"), `${entry.collection} must reference encrypted identity data`).toBe(false);
    }
  });
});
