// Rule-based smart insights computed locally over SQLite (see spec 9.8).

use std::collections::HashMap;

use chrono::{Datelike, NaiveDate, Utc};
use uuid::Uuid;

use crate::fx_convert::amount_in_base;
use crate::models::{Category, CategoryBudgetRow, Expense, FxRate, Insight, InsightKind};

fn date_in_range(date: &str, start: &str, end: &str) -> bool {
    let d = date_key(date);
    d >= start && d <= end
}

fn date_key(date: &str) -> &str {
    date.get(..10).unwrap_or(date)
}

fn parse_date(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date_key(date), "%Y-%m-%d").ok()
}

fn sum_category(
    expenses: &[&Expense],
    category_id: &str,
    base_currency: &str,
    rates: &[FxRate],
) -> i64 {
    expenses
        .iter()
        .filter(|e| e.category_id == category_id)
        .filter_map(|e| {
            let r = amount_in_base(
                e.amount_minor,
                &e.currency_code,
                &e.date,
                base_currency,
                rates,
            );
            if r.ok {
                Some(r.amount_minor)
            } else if e.currency_code == base_currency {
                Some(e.amount_minor)
            } else {
                None
            }
        })
        .sum()
}

fn sum_all(expenses: &[&Expense], base_currency: &str, rates: &[FxRate]) -> i64 {
    expenses
        .iter()
        .filter_map(|e| {
            let r = amount_in_base(
                e.amount_minor,
                &e.currency_code,
                &e.date,
                base_currency,
                rates,
            );
            if r.ok {
                Some(r.amount_minor)
            } else if e.currency_code == base_currency {
                Some(e.amount_minor)
            } else {
                None
            }
        })
        .sum()
}

fn category_name<'a>(categories: &'a [Category], id: &str) -> &'a str {
    categories
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.as_str())
        .unwrap_or("Category")
}

fn weekday_name(dow: u32) -> &'static str {
    match dow {
        0 => "Monday",
        1 => "Tuesday",
        2 => "Wednesday",
        3 => "Thursday",
        4 => "Friday",
        5 => "Saturday",
        _ => "Sunday",
    }
}

fn median(mut values: Vec<i64>) -> i64 {
    if values.is_empty() {
        return 0;
    }
    values.sort_unstable();
    let mid = values.len() / 2;
    if values.len() % 2 == 0 {
        (values[mid - 1] + values[mid]) / 2
    } else {
        values[mid]
    }
}

fn insight(kind: InsightKind, rule: &str, message_key: &str, params: serde_json::Value) -> Insight {
    Insight {
        id: Uuid::new_v4().to_string(),
        kind,
        rule: rule.to_string(),
        message_key: message_key.to_string(),
        params,
    }
}

#[allow(clippy::too_many_arguments)]
pub fn compute_insights(
    all_expenses: &[Expense],
    categories: &[Category],
    budget_items: &[CategoryBudgetRow],
    fx_rates: &[FxRate],
    base_currency: &str,
    period_start: &str,
    period_end: &str,
    prev_start: Option<&str>,
    prev_end: Option<&str>,
) -> Vec<Insight> {
    let active: Vec<&Expense> = all_expenses
        .iter()
        .filter(|e| e.deleted_at.is_none())
        .collect();

    let current: Vec<&Expense> = active
        .iter()
        .copied()
        .filter(|e| date_in_range(&e.date, period_start, period_end))
        .collect();

    let previous: Vec<&Expense> = match (prev_start, prev_end) {
        (Some(ps), Some(pe)) => active
            .iter()
            .copied()
            .filter(|e| date_in_range(&e.date, ps, pe))
            .collect(),
        _ => vec![],
    };

    let mut out: Vec<Insight> = Vec::new();

    // Rule 1: MoM category delta (> ±15%)
    if !previous.is_empty() {
        let mut cat_ids: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for e in &current {
            cat_ids.insert(&e.category_id);
        }
        for e in &previous {
            cat_ids.insert(&e.category_id);
        }
        for cat_id in cat_ids {
            let this_sum = sum_category(&current, cat_id, base_currency, fx_rates);
            let prev_sum = sum_category(&previous, cat_id, base_currency, fx_rates);
            if prev_sum == 0 || this_sum == 0 {
                continue;
            }
            let change = ((this_sum - prev_sum) as f64 / prev_sum as f64 * 100.0).round() as i64;
            if change.abs() < 15 {
                continue;
            }
            let name = category_name(categories, cat_id);
            if change > 0 {
                out.push(insight(
                    InsightKind::Insight,
                    "category_mom",
                    "insight.category_mom_up",
                    serde_json::json!({ "category": name, "percent": change.abs() }),
                ));
            } else {
                out.push(insight(
                    InsightKind::Insight,
                    "category_mom",
                    "insight.category_mom_down",
                    serde_json::json!({ "category": name, "percent": change.abs() }),
                ));
            }
        }
    }

    // Rule 2: Day-of-week pattern (trailing 8 weeks)
    let today = Utc::now().date_naive();
    let trail_start = today - chrono::Duration::days(56);
    let trail_start_s = trail_start.format("%Y-%m-%d").to_string();
    let trail_end_s = period_end.to_string();
    let trail: Vec<&Expense> = active
        .iter()
        .copied()
        .filter(|e| date_in_range(&e.date, &trail_start_s, &trail_end_s))
        .collect();

    let mut dow_totals: HashMap<u32, (i64, u32)> = HashMap::new();
    for e in &trail {
        if let Some(d) = parse_date(&e.date) {
            let dow = d.weekday().num_days_from_monday();
            let r = amount_in_base(
                e.amount_minor,
                &e.currency_code,
                &e.date,
                base_currency,
                fx_rates,
            );
            let amt = if r.ok {
                r.amount_minor
            } else if e.currency_code == base_currency {
                e.amount_minor
            } else {
                continue;
            };
            let entry = dow_totals.entry(dow).or_insert((0, 0));
            entry.0 += amt;
            entry.1 += 1;
        }
    }
    let mut peak_dow = 0u32;
    let mut peak_avg = 0i64;
    for (dow, (total, count)) in &dow_totals {
        if *count == 0 {
            continue;
        }
        let avg = total / *count as i64;
        if avg > peak_avg {
            peak_avg = avg;
            peak_dow = *dow;
        }
    }
    if peak_avg > 0 {
        out.push(insight(
            InsightKind::Insight,
            "peak_weekday",
            "insight.peak_weekday",
            serde_json::json!({
                "weekday": weekday_name(peak_dow),
                "amountMinor": peak_avg,
                "currency": base_currency,
            }),
        ));
    }

    // Rule 3: Budget threshold (80% warn, 100% alert)
    for b in budget_items {
        let spent = sum_category(&current, &b.category_id, base_currency, fx_rates);
        if b.limit_minor <= 0 {
            continue;
        }
        let pct = (spent as f64 / b.limit_minor as f64 * 100.0) as i64;
        let name = category_name(categories, &b.category_id);
        if pct >= 100 {
            out.push(insight(
                InsightKind::Alert,
                "budget_exceeded",
                "insight.budget_exceeded",
                serde_json::json!({
                    "category": name,
                    "overMinor": spent - b.limit_minor,
                    "currency": base_currency,
                }),
            ));
        } else if pct >= 80 {
            out.push(insight(
                InsightKind::Alert,
                "budget_warning",
                "insight.budget_warning",
                serde_json::json!({
                    "category": name,
                    "percent": pct,
                }),
            ));
        }
    }

    // Rule 4: Category concentration (top 2 > 60%)
    let total = sum_all(&current, base_currency, fx_rates);
    if total > 0 {
        let mut by_cat: HashMap<&str, i64> = HashMap::new();
        for e in &current {
            let r = amount_in_base(
                e.amount_minor,
                &e.currency_code,
                &e.date,
                base_currency,
                fx_rates,
            );
            let amt = if r.ok {
                r.amount_minor
            } else if e.currency_code == base_currency {
                e.amount_minor
            } else {
                continue;
            };
            *by_cat.entry(&e.category_id).or_insert(0) += amt;
        }
        let mut ranked: Vec<(i64, &str)> = by_cat.into_iter().map(|(id, t)| (t, id)).collect();
        ranked.sort_by_key(|item| std::cmp::Reverse(item.0));
        if ranked.len() >= 2 {
            let top_two: i64 = ranked[0].0 + ranked[1].0;
            let pct = (top_two as f64 / total as f64 * 100.0).round() as i64;
            if pct > 60 {
                out.push(insight(
                    InsightKind::Insight,
                    "category_concentration",
                    "insight.category_concentration",
                    serde_json::json!({ "percent": pct }),
                ));
            }
        }
    }

    // Rule 5: Unusual transaction (> 3× category median, trailing 90 days)
    let lookback_start = today - chrono::Duration::days(90);
    let lookback_s = lookback_start.format("%Y-%m-%d").to_string();
    let lookback: Vec<&Expense> = active
        .iter()
        .copied()
        .filter(|e| date_in_range(&e.date, &lookback_s, period_end))
        .collect();

    let mut by_cat_amounts: HashMap<&str, Vec<i64>> = HashMap::new();
    for e in &lookback {
        let r = amount_in_base(
            e.amount_minor,
            &e.currency_code,
            &e.date,
            base_currency,
            fx_rates,
        );
        let amt = if r.ok {
            r.amount_minor
        } else if e.currency_code == base_currency {
            e.amount_minor
        } else {
            continue;
        };
        by_cat_amounts.entry(&e.category_id).or_default().push(amt);
    }

    for e in &current {
        let med = by_cat_amounts
            .get(e.category_id.as_str())
            .map(|v| median(v.clone()))
            .unwrap_or(0);
        if med <= 0 {
            continue;
        }
        let r = amount_in_base(
            e.amount_minor,
            &e.currency_code,
            &e.date,
            base_currency,
            fx_rates,
        );
        let amt = if r.ok {
            r.amount_minor
        } else if e.currency_code == base_currency {
            e.amount_minor
        } else {
            continue;
        };
        if amt > med * 3 {
            let name = category_name(categories, &e.category_id);
            out.push(insight(
                InsightKind::Alert,
                "unusual_transaction",
                "insight.unusual_transaction",
                serde_json::json!({
                    "category": name,
                    "amountMinor": amt,
                    "currency": base_currency,
                }),
            ));
            break;
        }
    }

    // Alerts first, cap at 6
    out.sort_by(|a, b| {
        let ar = if a.kind == InsightKind::Alert { 0 } else { 1 };
        let br = if b.kind == InsightKind::Alert { 0 } else { 1 };
        ar.cmp(&br)
    });
    out.truncate(6);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Category, Expense};

    fn expense(id: &str, amount: i64, cat: &str, date: &str) -> Expense {
        Expense {
            id: id.into(),
            amount_minor: amount,
            currency_code: "USD".into(),
            category_id: cat.into(),
            date: date.into(),
            note: None,
            payment_method: None,
            tags: None,
            is_recurring: false,
            recurrence_id: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            deleted_at: None,
        }
    }

    fn cat(id: &str, name: &str) -> Category {
        Category {
            id: id.into(),
            name: name.into(),
            color: "#000".into(),
            icon: "tag".into(),
            is_active: true,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            deleted_at: None,
        }
    }

    #[test]
    fn category_concentration_rule() {
        let expenses = vec![
            expense("1", 7000, "food", "2026-05-10"),
            expense("2", 2500, "food", "2026-05-11"),
            expense("3", 500, "transport", "2026-05-12"),
        ];
        let categories = vec![cat("food", "Food"), cat("transport", "Transport")];
        let insights = compute_insights(
            &expenses,
            &categories,
            &[],
            &[],
            "USD",
            "2026-05-01",
            "2026-05-31",
            Some("2026-04-01"),
            Some("2026-04-30"),
        );
        assert!(insights.iter().any(|i| i.rule == "category_concentration"));
    }

    #[test]
    fn budget_exceeded_rule() {
        let expenses = vec![expense("1", 12000, "food", "2026-05-10")];
        let categories = vec![cat("food", "Food")];
        let budgets = vec![CategoryBudgetRow {
            category_id: "food".into(),
            limit_minor: 10000,
        }];
        let insights = compute_insights(
            &expenses,
            &categories,
            &budgets,
            &[],
            "USD",
            "2026-05-01",
            "2026-05-31",
            None,
            None,
        );
        assert!(insights.iter().any(|i| i.rule == "budget_exceeded"));
    }
}
