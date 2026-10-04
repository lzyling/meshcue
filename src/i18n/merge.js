/* A spread silently lets the last feature win. That makes two independent
   lanes' translations depend on file order, so a collision is an error even
   when both happen to have written the same words. */
export function mergeCatalogueFeatures(features) {
  const catalogues = {};
  for (const [file, entries] of Object.entries(features).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const locale = file.split("/").at(-2);
    const catalogue = (catalogues[locale] ||= {});
    for (const [key, value] of Object.entries(entries)) {
      if (Object.hasOwn(catalogue, key))
        throw new Error(`Duplicate i18n key ${locale}:${key} in ${file}`);
      catalogue[key] = value;
    }
  }
  return catalogues;
}
