type DynamicImportFn = <T = unknown>(moduleName: string) => Promise<T>;

export const dynamicImport: DynamicImportFn = async <T = unknown>(moduleName: string) => {
  const importer = new Function('m', 'return import(m)') as (m: string) => Promise<T>;
  return importer(moduleName);
};
