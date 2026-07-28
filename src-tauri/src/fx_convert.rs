// FX lookup and conversion for Rust-side aggregations (mirrors src/lib/fx.ts).

use crate::models::FxRate;

const CROSS_HUBS: [&str; 3] = ["USD", "EUR", "GBP"];

pub struct ConversionResult {
    pub amount_minor: i64,
    pub ok: bool,
}

fn date_key(date: &str) -> &str {
    date.get(..10).unwrap_or(date)
}

pub fn find_fx_rate(
    rates: &[FxRate],
    from: &str,
    to: &str,
    date: &str,
    allow_cross: bool,
) -> Option<f64> {
    if from == to {
        return Some(1.0);
    }
    let date_key = date_key(date);
    let mut best_direct: Option<&FxRate> = None;
    let mut best_inverse: Option<&FxRate> = None;

    for r in rates {
        if r.as_of_date.as_str() > date_key {
            continue;
        }
        if r.from_code == from
            && r.to_code == to
            && best_direct
                .map(|b| r.as_of_date > b.as_of_date)
                .unwrap_or(true)
        {
            best_direct = Some(r);
        }
        if r.from_code == to
            && r.to_code == from
            && best_inverse
                .map(|b| r.as_of_date > b.as_of_date)
                .unwrap_or(true)
        {
            best_inverse = Some(r);
        }
    }

    if let Some(d) = best_direct {
        return Some(d.rate);
    }
    if let Some(inv) = best_inverse {
        if inv.rate != 0.0 {
            return Some(1.0 / inv.rate);
        }
    }

    if !allow_cross {
        return None;
    }

    for hub in CROSS_HUBS {
        if hub == from || hub == to {
            continue;
        }
        let leg1 = find_fx_rate(rates, from, hub, date_key, false);
        let leg2 = find_fx_rate(rates, hub, to, date_key, false);
        if let (Some(a), Some(b)) = (leg1, leg2) {
            return Some(a * b);
        }
    }

    None
}

fn minor_per_major(code: &str) -> i64 {
    match code {
        "JPY" => 1,
        "KWD" => 1000,
        _ => 100,
    }
}

pub fn convert_minor(
    amount_minor: i64,
    from_code: &str,
    to_code: &str,
    as_of_date: &str,
    rates: &[FxRate],
) -> ConversionResult {
    if from_code == to_code {
        return ConversionResult {
            amount_minor,
            ok: true,
        };
    }

    let Some(rate) = find_fx_rate(rates, from_code, to_code, as_of_date, true) else {
        return ConversionResult {
            amount_minor: 0,
            ok: false,
        };
    };

    if rate <= 0.0 {
        return ConversionResult {
            amount_minor: 0,
            ok: false,
        };
    }

    let major = amount_minor as f64 / minor_per_major(from_code) as f64;
    let converted = (major * rate * minor_per_major(to_code) as f64).round() as i64;
    ConversionResult {
        amount_minor: converted,
        ok: true,
    }
}

pub fn amount_in_base(
    amount_minor: i64,
    currency_code: &str,
    date: &str,
    base_currency: &str,
    rates: &[FxRate],
) -> ConversionResult {
    convert_minor(amount_minor, currency_code, base_currency, date, rates)
}
