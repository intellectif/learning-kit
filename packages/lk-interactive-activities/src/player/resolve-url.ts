import type { AssetRef } from '../contract/types.js';
export type AssetUrlResolver = (asset: AssetRef) => string;
export function defaultResolveUrl(asset: AssetRef): string {
  return asset.url?.trim() ? asset.url : asset.assetKey;
}
export function resolveAssetUrl(asset: AssetRef, resolve?: AssetUrlResolver): string {
  return resolve ? resolve(asset) : defaultResolveUrl(asset);
}
