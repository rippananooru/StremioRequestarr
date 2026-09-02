declare module "stremio-addon-sdk" {
  interface Manifest {
    id: string;
    version: string;
    name: string;
    description?: string;
    resources: (
      | string
      | {
          name: string;
          types: string[];
          idPrefixes?: string[];
        }
    )[];
    types: string[];
    catalogs: unknown[];
    idPrefixes?: string[];
  }

  interface AddonInterface {
    listen(port: number, callback?: () => void): unknown;
  }

  interface ServeHTTPOptions {
    port: number;
  }

  interface AddonBuilder {
    getInterface(): AddonInterface;

    defineStreamHandler(
      handler: (args: { type: string; id: string }) => Promise<{
        streams: Array<{
          name?: string;
          title?: string;
          url?: string;
          externalUrl?: string;
        }>;
      }>
    ): AddonBuilder;

    defineCatalogHandler(
      handler: (args: { type: string; id: string }) => Promise<{
        metas: Array<{
          id: string;
          type: string;
          name: string;
        }>;
      }>
    ): AddonBuilder;

    defineMetaHandler(
      handler: (args: { type: string; id: string }) => Promise<{
        meta: {
          id: string;
          type: string;
          name: string;
          videos?: Array<{
            id: string;
            title: string;
            season: number;
            number: number;
          }>;
        } | null;
      }>
    ): AddonBuilder;
  }

  const addonBuilder: {
    new (manifest: Manifest): AddonBuilder;
  };

  function getRouter(addonInterface: AddonInterface): any;

  function serveHTTP(
    addonInterface: AddonInterface,
    options: ServeHTTPOptions
  ): void;

  export {
    AddonBuilder,
    addonBuilder,
    getRouter,
    serveHTTP
  };
}