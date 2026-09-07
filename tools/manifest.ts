import type { StoredFile } from './store';

export type ManifestLaunchAsset = {
  hash: string; key: string; contentType: string; url: string;
};
export type ManifestAsset = ManifestLaunchAsset & { fileExtension: string };

export type UpdateManifest = {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestLaunchAsset;
  assets: ManifestAsset[];
  metadata: Record<string, never>;
  extra: { expoClient: unknown };
};

const CONTENT_TYPES: Record<string, string> = {
  js: 'application/javascript',
  hbc: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPES[ext.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';
}

export function storeUrl(baseUrl: string, stored: StoredFile): string {
  return `${baseUrl.replace(/\/$/, '')}/store/${stored.storeFileName}`;
}

export function buildManifest(input: {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  baseUrl: string;
  launch: StoredFile;
  assets: StoredFile[];
  expoClient: unknown;
}): UpdateManifest {
  return {
    id: input.id,
    createdAt: input.createdAt,
    runtimeVersion: input.runtimeVersion,
    launchAsset: {
      hash: input.launch.hashBase64Url,
      key: input.launch.keyMd5,
      contentType: 'application/javascript',
      url: storeUrl(input.baseUrl, input.launch),
    },
    assets: input.assets.map((a) => ({
      hash: a.hashBase64Url,
      key: a.keyMd5,
      contentType: contentTypeForExt(a.ext),
      fileExtension: `.${a.ext.replace(/^\./, '')}`,
      url: storeUrl(input.baseUrl, a),
    })),
    metadata: {},
    extra: { expoClient: input.expoClient },
  };
}
