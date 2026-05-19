declare module "polygon-clipping" {
  export type Position = [number, number];
  export type Ring = Position[];
  export type Polygon = Ring[];
  export type MultiPolygon = Polygon[];
  export type Geom = Polygon | MultiPolygon;

  export function union(...geoms: Geom[]): MultiPolygon;
  export function intersection(...geoms: Geom[]): MultiPolygon | null;
  export function difference(subject: Geom, ...clips: Geom[]): MultiPolygon;
  export function xor(...geoms: Geom[]): MultiPolygon;
}
