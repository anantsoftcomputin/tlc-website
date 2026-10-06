import { Building2, RefreshCw } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasPermission } from "@/lib/auth/roles";
import { TboCatalogueManager } from "@/components/admin/tbo-catalogue-manager";

export const dynamic = "force-dynamic";

const formatDate = (value: unknown) => (typeof value === "string" && value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never");

export default async function SupplierCataloguePage() {
  const user = await requireAdminUser("content:write");
  const db = getAdminFirestore();
  const [cities, hotels, destinations] = await Promise.all([
    db.collection("supplierCities").where("orgId", "==", user.orgId).get(),
    db.collection("supplierHotels").where("orgId", "==", user.orgId).count().get(),
    db.collection("destinations").where("orgId", "==", user.orgId).select("slug", "name").get(),
  ]);
  const synced = cities.docs.map((doc) => doc.data()).sort((a, b) => String(a.cityName).localeCompare(String(b.cityName)));
  const configured = Boolean(process.env.TBO_API_USERNAME);
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Supplier content</p>
          <h1>TBO catalogue</h1>
          <p>Import TBO properties city by city. Imported hotels appear on the website through the Hotels catalogue; editorial changes are never overwritten by later syncs.</p>
        </div>
        <span className="admin-count"><Building2 />{hotels.data().count} supplier properties</span>
      </header>
      {!configured && (
        <div className="admin-empty"><h3>TBO is not configured on this server</h3><p>Add TBO_API_USERNAME, TBO_API_PASSWORD, TBO_STATIC_USERNAME and TBO_STATIC_PASSWORD to the server environment for both the website and Functions.</p></div>
      )}
      <TboCatalogueManager
        destinations={destinations.docs.map((doc) => ({ slug: String(doc.data().slug), name: String(doc.data().name || doc.data().slug) }))}
        canManageProviders={hasPermission(user.role, "settings:manage") || ["owner", "manager", "admin", "super_admin"].includes(user.role)}
      />
      <section className="admin-panel">
        <header><div><span><RefreshCw /></span><div><h2>Synced cities</h2><p>Refreshed automatically every 15 days, as TBO recommends.</p></div></div></header>
        {synced.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>City</th><th>Website destination</th><th>Imported</th><th>Filters</th><th>Last sync</th><th>Status</th></tr></thead>
              <tbody>
                {synced.map((city) => (
                  <tr key={String(city.id)}>
                    <td><b>{String(city.cityName)}</b><span>{String(city.countryCode)} · TBO {String(city.cityCode)}</span></td>
                    <td>{String(city.destinationSlug)}</td>
                    <td>{Number(city.hotelsImported || 0)} of {Number(city.hotelsAvailable || 0)}</td>
                    <td>{Number(city.minStars || 0)}★ and up · max {Number(city.maxHotels || 0)} · {city.publish ? "publish" : "draft"}</td>
                    <td>{formatDate(city.lastSyncedAt)}</td>
                    <td>{String(city.syncStatus || "completed")}{city.lastError && <small>{String(city.lastError)}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty"><h3>No cities imported yet</h3><p>Choose a country and city above to import TBO properties.</p></div>
        )}
      </section>
    </>
  );
}
