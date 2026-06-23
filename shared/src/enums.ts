/**
 * Controlled vocabularies for the TRANSITLAB engineering model.
 *
 * These are the canonical string unions used across client, server, and the
 * database (stored as text columns, validated against these lists).
 */

/** Transport mode of a line. Drives default styling and rolling-stock choices. */
export const MODES = [
  'heavy_rail',
  'metro_tube',
  'light_rail',
  'tram',
  'freight',
] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  heavy_rail: 'Heavy rail',
  metro_tube: 'Metro / tube',
  light_rail: 'Light rail',
  tram: 'Tram',
  freight: 'Freight',
};

/** Electrification system for a line. */
export const ELECTRIFICATIONS = [
  'ohle_25kv',
  'third_rail_750v',
  'ohle_1500v',
  'diesel',
  'battery',
  'hydrogen',
] as const;
export type Electrification = (typeof ELECTRIFICATIONS)[number];

export const ELECTRIFICATION_LABELS: Record<Electrification, string> = {
  ohle_25kv: '25 kV 50 Hz OHLE',
  third_rail_750v: '750 V DC third rail',
  ohle_1500v: '1500 V DC OHLE',
  diesel: 'Unelectrified — diesel',
  battery: 'Battery',
  hydrogen: 'Hydrogen',
};

/** Whether an electrification option requires trackside power infrastructure. */
export const ELECTRIFIED: Record<Electrification, boolean> = {
  ohle_25kv: true,
  third_rail_750v: true,
  ohle_1500v: true,
  diesel: false,
  battery: false,
  hydrogen: false,
};

/** Structural form a segment of line takes through the landscape. */
export const STRUCTURE_TYPES = [
  'tunnel_bored',
  'tunnel_cut_cover',
  'surface',
  'cutting',
  'embankment',
  'viaduct',
  'bridge',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const STRUCTURE_LABELS: Record<StructureType, string> = {
  tunnel_bored: 'Bored tunnel',
  tunnel_cut_cover: 'Cut-and-cover tunnel',
  surface: 'Surface',
  cutting: 'Cutting',
  embankment: 'Embankment',
  viaduct: 'Viaduct',
  bridge: 'Bridge',
};

/** Structural colours for the vertical profile strip and map dashing. */
export const STRUCTURE_COLOURS: Record<StructureType, string> = {
  tunnel_bored: '#5A4A8A',
  tunnel_cut_cover: '#7A6AA8',
  surface: '#4A8A6A',
  cutting: '#8A7A4A',
  embankment: '#A88A5A',
  viaduct: '#C46A4A',
  bridge: '#C44A6A',
};

/** Vertical position relative to grade — used to draw the profile cross-section. */
export const STRUCTURE_LEVEL: Record<StructureType, number> = {
  tunnel_bored: -2,
  tunnel_cut_cover: -1,
  surface: 0,
  cutting: -1,
  embankment: 1,
  viaduct: 2,
  bridge: 2,
};

/** Whether a structure type is below grade (drawn dashed on the map). */
export const IS_SUBSURFACE: Record<StructureType, boolean> = {
  tunnel_bored: true,
  tunnel_cut_cover: true,
  surface: false,
  cutting: false,
  embankment: false,
  viaduct: false,
  bridge: false,
};

/** Traction type for rolling stock. */
export const TRACTIONS = [
  'electric_ohle',
  'electric_third_rail',
  'diesel',
  'bi_mode',
  'battery',
  'hydrogen',
] as const;
export type Traction = (typeof TRACTIONS)[number];

/** Loading gauge classes (British structure gauge envelopes). */
export const LOADING_GAUGES = ['W6', 'W7', 'W8', 'W9', 'W10', 'W12', 'UIC_GC', 'metro'] as const;
export type LoadingGauge = (typeof LOADING_GAUGES)[number];

/** Common track gauges in millimetres. */
export const GAUGE_STANDARD_MM = 1435;
export const GAUGE_BRUNEL_MM = 2140;
export const GAUGE_NARROW_MM = 1000;
