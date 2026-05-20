// FX rate row (mirrors spec §11.6).

export interface FxRate {
  id: string;
  from_code: string;
  to_code: string;
  /** Major units: 1 unit of `from_code` equals `rate` units of `to_code`. */
  rate: number;
  as_of_date: string;
}
