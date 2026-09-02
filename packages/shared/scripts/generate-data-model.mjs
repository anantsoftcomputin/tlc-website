import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toJSONSchema } from "zod";
import { schemaCatalog } from "../dist/schemas/schema-catalog.js";

function mergeObjectShape(schema) {
  const properties = { ...(schema.properties || {}) };
  const required = new Set(schema.required || []);
  for (const part of schema.allOf || []) {
    const nested = mergeObjectShape(part);
    Object.assign(properties, nested.properties);
    nested.required.forEach((field) => required.add(field));
  }
  return { properties, required };
}

function describeType(schema) {
  if (schema.enum) return schema.enum.map(String).join(" | ");
  if (schema.type === "array") return `${describeType(schema.items || {})}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.anyOf) return schema.anyOf.map(describeType).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(describeType).join(" | ");
  return schema.type || "object";
}

const sections = schemaCatalog.map((entry) => {
  const json = toJSONSchema(entry.schema, { unrepresentable: "any" });
  const shape = mergeObjectShape(json);
  const rows = Object.entries(shape.properties)
    .map(([field, property]) => `| \`${field}\` | ${describeType(property).replaceAll("|", "\\|")} | ${shape.required.has(field) ? "Yes" : "No"} |`)
    .join("\n");
  return `## \`${entry.collection}\`\n\n${entry.description}\n\n- Organization scoped: ${entry.orgScoped ? "Yes" : "No"}\n- Server writes only: ${entry.serverWritesOnly ? "Yes" : "No"}\n\n| Field | Type | Required |\n|---|---|---|\n${rows}`;
});

const summaryRows = schemaCatalog
  .map((entry) => `| \`${entry.collection}\` | ${entry.orgScoped ? "Yes" : "No"} | ${entry.serverWritesOnly ? "Yes" : "No"} | ${entry.description} |`)
  .join("\n");

const output = `# TLC Travel OS Data Model

> Generated from \`packages/shared/src/schemas/schema-catalog.ts\`. Do not edit collection fields manually; update the Zod schema and run \`pnpm docs:data-model\`.

## Conventions

- Business documents use \`orgId\` for tenant isolation.
- Mutable documents carry \`createdAt\`, \`updatedAt\`, \`createdBy\`, and \`updatedBy\`.
- Dates cross API boundaries as ISO 8601 strings; Firestore repositories convert them to timestamps.
- Currency values use major units and are rounded to two decimals by shared financial utilities.
- Sensitive identity values are references to encrypted material, never plaintext passport numbers.
- AI output includes human-readable \`reasoning\` and feature attribution where applicable.
- Browser clients cannot write audit logs, payment truth, analytics aggregates, or AI scores.

## Collection summary

| Collection | Org scoped | Server writes only | Purpose |
|---|---|---|---|
${summaryRows}

${sections.join("\n\n")}
`;

await writeFile(resolve(process.cwd(), "../../docs/DATA_MODEL.md"), output, "utf8");
console.log(`Generated docs/DATA_MODEL.md from ${schemaCatalog.length} schemas.`);
