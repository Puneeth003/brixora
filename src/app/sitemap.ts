import type { MetadataRoute } from "next";
import { getAllPublicRefs, getLocalities } from "@/lib/queries";
import { slugify } from "@/lib/format";
import { site } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [refs, localities] = await Promise.all([getAllPublicRefs(), getLocalities()]);
  return [
    { url: `${site.url}/`, changeFrequency: "daily", priority: 1 },
    { url: `${site.url}/properties`, changeFrequency: "daily", priority: 0.9 },
    { url: `${site.url}/localities`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${site.url}/post`, changeFrequency: "monthly", priority: 0.5 },
    ...localities.map((l) => ({
      url: `${site.url}/localities/${slugify(l.locality)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...refs.map((r) => ({
      url: `${site.url}/properties/${r.reference_no}`,
      lastModified: r.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
