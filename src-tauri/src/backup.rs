// Secure .etbackup archive creation, inspection, and restore.

use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::AppDb;
use crate::error::{AppError, AppResult};
use crate::models::{
    AppBackupPayload, BackupArtifact, BackupFileInfo, BackupInspection, BackupManifest,
    RestoreMode, RestoreSummary,
};

const FORMAT_VERSION: i32 = 1;
const LATEST_SCHEMA_VERSION: i32 = 4;
const ENCRYPTED_MAGIC: &[u8; 8] = b"ETBENC01";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;

#[derive(Debug)]
struct PreparedArchive {
    root: PathBuf,
    inspection: BackupInspection,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestore {
    staging_directory: String,
    safety_backup_path: String,
    created_at: String,
}

#[derive(Debug)]
struct ReceiptSource {
    stored_name: String,
    original_name: String,
    size_bytes: i64,
    sha256: String,
}

pub fn create_archive(
    db: &AppDb,
    backup_dir: &str,
    password: Option<&str>,
    backup_kind: &str,
) -> AppResult<BackupFileInfo> {
    if !matches!(backup_kind, "manual" | "automatic" | "safety") {
        return Err(AppError::Message("Unsupported backup kind.".into()));
    }
    if password.is_some_and(|value| value.chars().count() < 8) {
        return Err(AppError::Message(
            "Backup passwords must contain at least 8 characters.".into(),
        ));
    }

    let output_dir = resolve_backup_dir(backup_dir)?;
    fs::create_dir_all(&output_dir)?;
    let output_dir = output_dir.canonicalize()?;
    if !output_dir.is_dir() {
        return Err(AppError::Message(
            "The configured backup location is not a folder.".into(),
        ));
    }

    let work = db
        .data_dir()
        .join(format!(".backup-work-{}", Uuid::new_v4()));
    fs::create_dir_all(&work)?;
    let result = (|| {
        let snapshot_path = work.join("database.sqlite");
        db.snapshot_to(&snapshot_path)?;
        let zip_path = work.join("archive.zip");
        build_zip(
            &snapshot_path,
            &db.data_dir().join("receipts"),
            &zip_path,
            password.is_some(),
            backup_kind,
        )?;

        let stamp = chrono::Utc::now().format("%Y-%m-%d_%H%M%S");
        let unique = Uuid::new_v4().simple().to_string();
        let file_name = format!(
            "expense_tracker_backup_{stamp}_{}_{backup_kind}.etbackup",
            &unique[..8]
        );
        let destination = output_dir.join(&file_name);
        if password.is_some() {
            let zip_bytes = read_limited(&zip_path, MAX_ARCHIVE_BYTES)?;
            let encrypted = encrypt_bytes(&zip_bytes, password.unwrap_or_default())?;
            write_private(&destination, &encrypted)?;
        } else {
            fs::copy(&zip_path, &destination)?;
            set_private_permissions(&destination)?;
        }

        if backup_kind == "automatic" {
            prune_automatic_backups(&output_dir, 10)?;
        }
        backup_file_info(&destination)
    })();
    let _ = fs::remove_dir_all(&work);
    result
}

pub fn list_archives(backup_dir: &str) -> AppResult<Vec<BackupFileInfo>> {
    let path = resolve_backup_dir(backup_dir)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    if !path.is_dir() {
        return Err(AppError::Message(
            "The configured backup location is not a folder.".into(),
        ));
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let supported =
            name.ends_with(".etbackup") || name.ends_with(".json") || name.ends_with(".enc.json");
        if !name.starts_with("expense_tracker_backup_") || !supported {
            continue;
        }
        files.push(backup_file_info(&entry.path())?);
    }
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(files)
}

pub fn inspect_archive(
    db: &AppDb,
    file_path: &str,
    password: Option<&str>,
) -> AppResult<BackupInspection> {
    let prepared = prepare_archive(db, file_path, password)?;
    let inspection = prepared.inspection.clone();
    let _ = fs::remove_dir_all(prepared.root);
    Ok(inspection)
}

pub fn restore_archive(
    db: &AppDb,
    file_path: &str,
    password: Option<&str>,
    mode: RestoreMode,
    backup_dir: &str,
) -> AppResult<RestoreSummary> {
    let prepared = prepare_archive(db, file_path, password)?;
    match mode {
        RestoreMode::DryRun => {
            let result = compare_for_merge(db, &prepared);
            let _ = fs::remove_dir_all(prepared.root);
            result
        }
        RestoreMode::Merge => {
            let result = merge_prepared_archive(db, &prepared);
            let _ = fs::remove_dir_all(prepared.root);
            result
        }
        RestoreMode::Replace => stage_replace(db, prepared, backup_dir),
    }
}

pub fn import_legacy_file(db: &AppDb, file_path: &str, password: Option<&str>) -> AppResult<()> {
    let path = validate_selected_file(file_path, &["json"])?;
    let raw = read_limited(&path, 100 * 1024 * 1024)?;
    let json = if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(".enc.json"))
    {
        let password = password.filter(|value| !value.is_empty()).ok_or_else(|| {
            AppError::Message("Password required to restore this legacy backup.".into())
        })?;
        decode_legacy_encrypted_json(&raw, password)?
    } else {
        String::from_utf8(raw)
            .map_err(|_| AppError::Message("Legacy backup is not valid UTF-8 JSON.".into()))?
    };
    let payload: AppBackupPayload = serde_json::from_str(&json)
        .map_err(|_| AppError::Message("Invalid legacy backup file.".into()))?;
    db.import_backup(&payload)
}

pub fn apply_pending_restore(data_dir: &Path) -> AppResult<()> {
    let pending_path = data_dir.join("pending-restore.json");
    if !pending_path.is_file() {
        return Ok(());
    }
    let pending: PendingRestore = match read_limited(&pending_path, 1024 * 1024)
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(Into::into))
    {
        Ok(value) => value,
        Err(error) => {
            quarantine_failed_restore(data_dir, &pending_path, None, &error.to_string());
            return Ok(());
        }
    };
    let staging_name = match safe_single_component(&pending.staging_directory) {
        Ok(value) if value.starts_with(".pending-restore-") => value,
        _ => {
            quarantine_failed_restore(
                data_dir,
                &pending_path,
                None,
                "Pending restore location is invalid.",
            );
            return Ok(());
        }
    };
    let staging = data_dir.join(staging_name);
    let staged_db = staging.join("database.sqlite");
    let validation = (|| -> AppResult<()> {
        let staged_manifest: BackupManifest =
            serde_json::from_slice(&read_limited(&staging.join("manifest.json"), 1024 * 1024)?)?;
        validate_extracted(
            &staging,
            staged_manifest.encrypted,
            "pending replacement backup",
        )?;
        Ok(())
    })();
    if let Err(error) = validation {
        quarantine_failed_restore(data_dir, &pending_path, Some(&staging), &error.to_string());
        return Ok(());
    }

    let rollback = data_dir.join(format!(".restore-rollback-{}", Uuid::new_v4()));
    fs::create_dir_all(&rollback)?;
    let live_db = data_dir.join("expense_tracker.db");
    let live_receipts = data_dir.join("receipts");
    let staged_receipts = staging.join("receipts");
    let rollback_db = rollback.join("expense_tracker.db");
    let rollback_receipts = rollback.join("receipts");

    let apply_result: AppResult<()> = (|| {
        if live_db.exists() {
            fs::rename(&live_db, &rollback_db)?;
        }
        for suffix in ["-wal", "-shm"] {
            let source = data_dir.join(format!("expense_tracker.db{suffix}"));
            if source.exists() {
                fs::rename(
                    &source,
                    rollback.join(format!("expense_tracker.db{suffix}")),
                )?;
            }
        }
        if live_receipts.exists() {
            fs::rename(&live_receipts, &rollback_receipts)?;
        }

        fs::copy(&staged_db, &live_db)?;
        set_private_permissions(&live_db)?;
        if staged_receipts.is_dir() {
            copy_directory(&staged_receipts, &live_receipts)?;
        } else {
            fs::create_dir_all(&live_receipts)?;
        }
        validate_sqlite(&live_db, None)?;
        Ok(())
    })();

    if let Err(error) = apply_result {
        let _ = fs::remove_file(&live_db);
        let _ = fs::remove_dir_all(&live_receipts);
        if rollback_db.exists() {
            let _ = fs::rename(&rollback_db, &live_db);
        }
        if rollback_receipts.exists() {
            let _ = fs::rename(&rollback_receipts, &live_receipts);
        }
        for suffix in ["-wal", "-shm"] {
            let source = rollback.join(format!("expense_tracker.db{suffix}"));
            if source.exists() {
                let _ = fs::rename(source, data_dir.join(format!("expense_tracker.db{suffix}")));
            }
        }
        let _ = fs::remove_dir_all(&rollback);
        quarantine_failed_restore(
            data_dir,
            &pending_path,
            Some(&staging),
            &format!("The previous data was recovered after restore failed: {error}"),
        );
        return Ok(());
    }

    let _ = fs::remove_file(&pending_path);
    let _ = fs::remove_file(data_dir.join("restore-failure.txt"));
    let _ = fs::remove_dir_all(&staging);
    let _ = fs::remove_dir_all(&rollback);
    Ok(())
}

fn quarantine_failed_restore(
    data_dir: &Path,
    pending_path: &Path,
    staging: Option<&Path>,
    message: &str,
) {
    let failed_pending = data_dir.join("pending-restore.failed.json");
    let _ = fs::remove_file(&failed_pending);
    let _ = fs::rename(pending_path, failed_pending);
    if let Some(staging) = staging {
        let _ = fs::remove_dir_all(staging);
    }
    let _ = write_private(&data_dir.join("restore-failure.txt"), message.as_bytes());
}

fn build_zip(
    snapshot_path: &Path,
    receipt_dir: &Path,
    zip_path: &Path,
    encrypted: bool,
    backup_kind: &str,
) -> AppResult<()> {
    let conn = Connection::open(snapshot_path)?;
    let schema_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    validate_sqlite(snapshot_path, Some(schema_version))?;
    validate_database_records(snapshot_path)?;
    let base_currency = current_base_currency(&conn);
    let record_counts = database_counts(&conn)?;

    let mut receipt_stmt = conn.prepare(
        "SELECT stored_name, original_name, size_bytes, sha256
         FROM receipt_attachments ORDER BY stored_name",
    )?;
    let receipts = receipt_stmt
        .query_map([], |row| {
            Ok(ReceiptSource {
                stored_name: row.get(0)?,
                original_name: row.get(1)?,
                size_bytes: row.get(2)?,
                sha256: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(receipt_stmt);

    let mut artifacts = vec![artifact_for_file("database.sqlite", snapshot_path)?];
    let mut receipt_files = Vec::new();
    for receipt in receipts {
        let name = safe_single_component(&receipt.stored_name)?;
        let source = receipt_dir.join(&name);
        if !source.is_file() {
            return Err(AppError::Message(format!(
                "Receipt {} is missing; backup was not created.",
                receipt.original_name
            )));
        }
        let artifact = artifact_for_file(&format!("receipts/{name}"), &source)?;
        if artifact.size_bytes != receipt.size_bytes as u64 || artifact.sha256 != receipt.sha256 {
            return Err(AppError::Message(format!(
                "Receipt {} failed its integrity check; backup was not created.",
                receipt.original_name
            )));
        }
        let bytes = read_limited(&source, 10 * 1024 * 1024)?;
        if detect_receipt_mime(&bytes).is_none() {
            return Err(AppError::Message(format!(
                "Receipt {} has unsupported content; backup was not created.",
                receipt.original_name
            )));
        }
        artifacts.push(artifact);
        receipt_files.push((format!("receipts/{name}"), source));
    }

    let manifest = BackupManifest {
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version,
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        backup_kind: backup_kind.to_string(),
        base_currency,
        encrypted,
        record_counts,
        artifacts,
    };

    let output = File::create(zip_path)?;
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    writer
        .start_file("manifest.json", options)
        .map_err(zip_error)?;
    writer.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
    add_file_to_zip(&mut writer, "database.sqlite", snapshot_path, options)?;
    for (archive_path, source) in receipt_files {
        add_file_to_zip(&mut writer, &archive_path, &source, options)?;
    }
    writer.finish().map_err(zip_error)?;
    Ok(())
}

fn prepare_archive(
    db: &AppDb,
    file_path: &str,
    password: Option<&str>,
) -> AppResult<PreparedArchive> {
    let path = validate_selected_file(file_path, &["etbackup"])?;
    let raw = read_limited(&path, MAX_ARCHIVE_BYTES)?;
    let (zip_bytes, encrypted) = decrypt_if_needed(&raw, password)?;
    let root = db
        .data_dir()
        .join(format!(".backup-read-{}", Uuid::new_v4()));
    fs::create_dir_all(&root)?;
    let result = (|| {
        extract_zip_safely(&zip_bytes, &root)?;
        validate_extracted(
            &root,
            encrypted,
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("backup.etbackup"),
        )
    })();
    match result {
        Ok(inspection) => Ok(PreparedArchive { root, inspection }),
        Err(error) => {
            let _ = fs::remove_dir_all(root);
            Err(error)
        }
    }
}

fn validate_extracted(
    root: &Path,
    encrypted: bool,
    file_name: &str,
) -> AppResult<BackupInspection> {
    let manifest_path = root.join("manifest.json");
    let manifest: BackupManifest =
        serde_json::from_slice(&read_limited(&manifest_path, 1024 * 1024)?)
            .map_err(|_| AppError::Message("Backup manifest is invalid.".into()))?;
    if manifest.format_version != FORMAT_VERSION {
        return Err(AppError::Message(format!(
            "Unsupported .etbackup format version {}.",
            manifest.format_version
        )));
    }
    if manifest.encrypted != encrypted {
        return Err(AppError::Message(
            "Backup encryption metadata does not match the archive.".into(),
        ));
    }
    if manifest.schema_version > LATEST_SCHEMA_VERSION {
        return Err(AppError::Message(format!(
            "This backup uses database schema {}, but this application supports up to {}.",
            manifest.schema_version, LATEST_SCHEMA_VERSION
        )));
    }
    if manifest.schema_version <= 0 {
        return Err(AppError::Message(
            "Backup database schema version is invalid.".into(),
        ));
    }

    let mut expected = HashSet::new();
    for artifact in &manifest.artifacts {
        if !expected.insert(artifact.path.clone()) {
            return Err(AppError::Message(
                "Backup manifest contains duplicate artifact paths.".into(),
            ));
        }
        let relative = validate_artifact_path(&artifact.path)?;
        let actual = root.join(relative);
        if !actual.is_file() {
            return Err(AppError::Message(format!(
                "Backup artifact {} is missing.",
                artifact.path
            )));
        }
        let verified = artifact_for_file(&artifact.path, &actual)?;
        if verified.size_bytes != artifact.size_bytes || verified.sha256 != artifact.sha256 {
            return Err(AppError::Message(format!(
                "Backup artifact {} failed its checksum.",
                artifact.path
            )));
        }
    }
    if !expected.contains("database.sqlite") {
        return Err(AppError::Message(
            "Backup manifest does not include database.sqlite.".into(),
        ));
    }

    let db_path = root.join("database.sqlite");
    validate_sqlite(&db_path, Some(manifest.schema_version))?;
    validate_database_records(&db_path)?;
    validate_receipts(root, &db_path, &expected)?;

    let mut actual = HashSet::new();
    collect_archive_files(root, root, &mut actual)?;
    actual.remove("manifest.json");
    if actual != expected {
        return Err(AppError::Message(
            "Backup contains files that are not declared in its manifest.".into(),
        ));
    }

    let mut warnings = Vec::new();
    if manifest.app_version != env!("CARGO_PKG_VERSION") {
        warnings.push(format!(
            "Backup was created by Expense Tracker {}.",
            manifest.app_version
        ));
    }
    Ok(BackupInspection {
        file_name: file_name.to_string(),
        encrypted,
        manifest,
        integrity_ok: true,
        warnings,
    })
}

fn compare_for_merge(db: &AppDb, prepared: &PreparedArchive) -> AppResult<RestoreSummary> {
    let incoming = prepared.root.join("database.sqlite");
    let incoming_text = incoming.to_string_lossy().to_string();
    db.with_conn(|conn| {
        conn.execute("ATTACH DATABASE ?1 AS incoming", [incoming_text])?;
        let result = (|| {
            let mut added = BTreeMap::new();
            let mut skipped = BTreeMap::new();
            for (name, total_sql, added_sql) in comparison_queries() {
                let total: i64 = conn.query_row(total_sql, [], |row| row.get(0))?;
                let addable: i64 = conn.query_row(added_sql, [], |row| row.get(0))?;
                added.insert(name.to_string(), addable);
                skipped.insert(name.to_string(), total - addable);
            }
            let mut warnings = prepared.inspection.warnings.clone();
            let recurring: i64 =
                conn.query_row("SELECT COUNT(*) FROM incoming.recurring_rules", [], |row| {
                    row.get(0)
                })?;
            if recurring > 0 {
                warnings.push(format!(
                    "{recurring} recurring rules are preserved in the archive but excluded from merge restore."
                ));
            }
            Ok(RestoreSummary {
                mode: RestoreMode::DryRun,
                conflicts: skipped.clone(),
                added,
                skipped,
                warnings,
                safety_backup_path: None,
                restart_required: false,
            })
        })();
        let _ = conn.execute_batch("DETACH DATABASE incoming;");
        result
    })
}

fn merge_prepared_archive(db: &AppDb, prepared: &PreparedArchive) -> AppResult<RestoreSummary> {
    let incoming = prepared.root.join("database.sqlite");
    let source_receipts = prepared.root.join("receipts");
    let live_receipts = db.data_dir().join("receipts");
    fs::create_dir_all(&live_receipts)?;
    let incoming_text = incoming.to_string_lossy().to_string();
    let mut copied_files = Vec::new();

    let result = db.with_conn(|conn| {
        conn.execute("ATTACH DATABASE ?1 AS incoming", [incoming_text])?;
        let merge_result = (|| {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(
                "DROP TABLE IF EXISTS temp.etbackup_new_expenses;
                 CREATE TEMP TABLE etbackup_new_expenses (id TEXT PRIMARY KEY);
                 INSERT INTO etbackup_new_expenses (id)
                   SELECT i.id FROM incoming.expenses i
                   WHERE NOT EXISTS (SELECT 1 FROM main.expenses m WHERE m.id = i.id);",
            )?;

            let category_added = tx.execute(
                "INSERT OR IGNORE INTO main.categories
                 (id,name,color,icon,is_active,created_at,updated_at,deleted_at)
                 SELECT id,name,color,icon,is_active,created_at,updated_at,deleted_at
                 FROM incoming.categories",
                [],
            )? as i64;
            let expense_added = tx.execute(
                "INSERT OR IGNORE INTO main.expenses
                 (id,amount_minor,currency_code,category_id,date,note,payment_method,tags_json,
                  is_recurring,recurrence_id,created_at,updated_at,deleted_at)
                 SELECT id,amount_minor,currency_code,category_id,date,note,payment_method,tags_json,
                        is_recurring,recurrence_id,created_at,updated_at,deleted_at
                 FROM incoming.expenses",
                [],
            )? as i64;
            let budget_added = tx.execute(
                "INSERT OR IGNORE INTO main.budgets
                 (id,category_id,limit_amount_minor,currency_code,period_type,created_at,updated_at,deleted_at)
                 SELECT id,category_id,limit_amount_minor,currency_code,period_type,created_at,updated_at,deleted_at
                 FROM incoming.budgets",
                [],
            )? as i64;
            let fx_added = tx.execute(
                "INSERT OR IGNORE INTO main.fx_rates
                 (id,from_code,to_code,rate,as_of_date,source,created_at,updated_at)
                 SELECT id,from_code,to_code,rate,as_of_date,source,created_at,updated_at
                 FROM incoming.fx_rates",
                [],
            )? as i64;

            let receipt_rows = {
                let mut stmt = tx.prepare(
                    "SELECT r.stored_name,r.original_name,r.mime_type,r.size_bytes,r.sha256,
                            r.created_at,r.updated_at,r.expense_id
                     FROM incoming.receipt_attachments r
                     JOIN temp.etbackup_new_expenses n ON n.id = r.expense_id",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            };

            let mut receipt_added = 0_i64;
            for (stored, original, mime, size, sha, created, updated, expense_id) in receipt_rows {
                let source_name = safe_single_component(&stored)?;
                let source = source_receipts.join(source_name);
                let extension = Path::new(&stored)
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("bin");
                let target_name = format!("{}.{}", Uuid::new_v4(), extension);
                let target = live_receipts.join(&target_name);
                fs::copy(&source, &target)?;
                set_private_permissions(&target)?;
                copied_files.push(target);
                let id = Uuid::new_v4().to_string();
                receipt_added += tx.execute(
                    "INSERT INTO main.receipt_attachments
                     (id,expense_id,stored_name,original_name,mime_type,size_bytes,sha256,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    params![
                        id, expense_id, target_name, original, mime, size, sha, created, updated
                    ],
                )? as i64;
            }

            tx.execute_batch("DROP TABLE temp.etbackup_new_expenses;")?;
            tx.commit()?;
            let totals = database_counts(&Connection::open(&incoming)?)?;
            let mut added = BTreeMap::new();
            added.insert("categories".into(), category_added);
            added.insert("expenses".into(), expense_added);
            added.insert("budgets".into(), budget_added);
            added.insert("fxRates".into(), fx_added);
            added.insert("receipts".into(), receipt_added);
            let mut skipped = BTreeMap::new();
            for key in ["categories", "expenses", "budgets", "fxRates", "receipts"] {
                let total = *totals.get(key).unwrap_or(&0);
                let inserted = *added.get(key).unwrap_or(&0);
                skipped.insert(key.to_string(), (total - inserted).max(0));
            }
            let mut warnings = prepared.inspection.warnings.clone();
            let recurring = *totals.get("recurringRules").unwrap_or(&0);
            if recurring > 0 {
                warnings.push(format!(
                    "{recurring} recurring rules were left unchanged as required by the restore policy."
                ));
            }
            Ok(RestoreSummary {
                mode: RestoreMode::Merge,
                conflicts: skipped.clone(),
                added,
                skipped,
                warnings,
                safety_backup_path: None,
                restart_required: false,
            })
        })();
        let _ = conn.execute_batch(
            "DROP TABLE IF EXISTS temp.etbackup_new_expenses;
             DETACH DATABASE incoming;",
        );
        merge_result
    });
    if result.is_err() {
        for path in copied_files {
            let _ = fs::remove_file(path);
        }
    }
    result
}

fn stage_replace(
    db: &AppDb,
    prepared: PreparedArchive,
    backup_dir: &str,
) -> AppResult<RestoreSummary> {
    let pending_path = db.data_dir().join("pending-restore.json");
    if pending_path.exists() {
        let _ = fs::remove_dir_all(prepared.root);
        return Err(AppError::Message(
            "Another replacement restore is already waiting for an application restart.".into(),
        ));
    }
    let safety = create_archive(db, backup_dir, None, "safety")?;
    let staging_name = format!(".pending-restore-{}", Uuid::new_v4());
    let staging = db.data_dir().join(&staging_name);
    fs::rename(&prepared.root, &staging)?;

    let pending = PendingRestore {
        staging_directory: staging_name,
        safety_backup_path: safety.path.clone(),
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    };
    let temporary = db.data_dir().join("pending-restore.json.tmp");
    if let Err(error) = (|| -> AppResult<()> {
        write_private(&temporary, &serde_json::to_vec_pretty(&pending)?)?;
        fs::rename(&temporary, &pending_path)?;
        Ok(())
    })() {
        let _ = fs::remove_file(temporary);
        let _ = fs::remove_dir_all(staging);
        return Err(error);
    }

    let mut added = prepared.inspection.manifest.record_counts.clone();
    added.remove("deletedExpenses");
    added.remove("deletedCategories");
    added.remove("deletedBudgets");
    Ok(RestoreSummary {
        mode: RestoreMode::Replace,
        added,
        skipped: BTreeMap::new(),
        conflicts: BTreeMap::new(),
        warnings: prepared.inspection.warnings,
        safety_backup_path: Some(safety.path),
        restart_required: true,
    })
}

fn comparison_queries() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        (
            "categories",
            "SELECT COUNT(*) FROM incoming.categories",
            "SELECT COUNT(*) FROM incoming.categories i
             WHERE NOT EXISTS (SELECT 1 FROM main.categories m WHERE m.id=i.id)",
        ),
        (
            "expenses",
            "SELECT COUNT(*) FROM incoming.expenses",
            "SELECT COUNT(*) FROM incoming.expenses i
             WHERE NOT EXISTS (SELECT 1 FROM main.expenses m WHERE m.id=i.id)",
        ),
        (
            "budgets",
            "SELECT COUNT(*) FROM incoming.budgets",
            "SELECT COUNT(*) FROM incoming.budgets i
             WHERE NOT EXISTS (SELECT 1 FROM main.budgets m WHERE m.id=i.id)
               AND (i.deleted_at IS NOT NULL OR NOT EXISTS (
                 SELECT 1 FROM main.budgets m
                 WHERE m.deleted_at IS NULL
                   AND COALESCE(m.category_id,'__overall__')=COALESCE(i.category_id,'__overall__')
                   AND m.period_type=i.period_type
               ))",
        ),
        (
            "fxRates",
            "SELECT COUNT(*) FROM incoming.fx_rates",
            "SELECT COUNT(*) FROM incoming.fx_rates i
             WHERE NOT EXISTS (
               SELECT 1 FROM main.fx_rates m
               WHERE m.id=i.id OR (
                 m.from_code=i.from_code AND m.to_code=i.to_code AND m.as_of_date=i.as_of_date
               )
             )",
        ),
        (
            "receipts",
            "SELECT COUNT(*) FROM incoming.receipt_attachments",
            "SELECT COUNT(*) FROM incoming.receipt_attachments r
             WHERE NOT EXISTS (SELECT 1 FROM main.expenses m WHERE m.id=r.expense_id)",
        ),
    ]
}

fn database_counts(conn: &Connection) -> AppResult<BTreeMap<String, i64>> {
    let queries = [
        ("expenses", "SELECT COUNT(*) FROM expenses"),
        (
            "deletedExpenses",
            "SELECT COUNT(*) FROM expenses WHERE deleted_at IS NOT NULL",
        ),
        ("categories", "SELECT COUNT(*) FROM categories"),
        (
            "deletedCategories",
            "SELECT COUNT(*) FROM categories WHERE deleted_at IS NOT NULL",
        ),
        ("budgets", "SELECT COUNT(*) FROM budgets"),
        (
            "deletedBudgets",
            "SELECT COUNT(*) FROM budgets WHERE deleted_at IS NOT NULL",
        ),
        ("receipts", "SELECT COUNT(*) FROM receipt_attachments"),
        ("fxRates", "SELECT COUNT(*) FROM fx_rates"),
        ("recurringRules", "SELECT COUNT(*) FROM recurring_rules"),
    ];
    let mut counts = BTreeMap::new();
    for (name, sql) in queries {
        counts.insert(name.to_string(), conn.query_row(sql, [], |row| row.get(0))?);
    }
    Ok(counts)
}

fn validate_receipts(root: &Path, db_path: &Path, artifacts: &HashSet<String>) -> AppResult<()> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare("SELECT stored_name,size_bytes,sha256 FROM receipt_attachments")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (stored, size, sha) in rows {
        let stored = safe_single_component(&stored)?;
        let archive_path = format!("receipts/{stored}");
        if !artifacts.contains(&archive_path) {
            return Err(AppError::Message(format!(
                "Receipt {stored} is missing from the backup manifest."
            )));
        }
        let verified = artifact_for_file(&archive_path, &root.join(&archive_path))?;
        if verified.size_bytes != size as u64 || verified.sha256 != sha {
            return Err(AppError::Message(format!(
                "Receipt {stored} does not match its database metadata."
            )));
        }
        let bytes = read_limited(&root.join(&archive_path), 10 * 1024 * 1024)?;
        if detect_receipt_mime(&bytes).is_none() {
            return Err(AppError::Message(format!(
                "Receipt {stored} is not a supported JPEG, PNG, or WebP image."
            )));
        }
    }
    Ok(())
}

fn validate_database_records(path: &Path) -> AppResult<()> {
    let conn = Connection::open(path)?;

    let mut category_stmt =
        conn.prepare("SELECT id,name,color,icon FROM categories ORDER BY id")?;
    let categories = category_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, name, color, icon) in categories {
        let color_ok = color.len() == 7
            && color.starts_with('#')
            && color[1..]
                .chars()
                .all(|character| character.is_ascii_hexdigit());
        if id.trim().is_empty()
            || name.trim().is_empty()
            || name.chars().count() > 80
            || !color_ok
            || icon.trim().is_empty()
            || icon.chars().count() > 64
        {
            return Err(AppError::Message(format!(
                "Backup contains an invalid category record ({id})."
            )));
        }
    }

    let mut expense_stmt = conn.prepare(
        "SELECT id,amount_minor,currency_code,date,note,payment_method,tags_json
         FROM expenses ORDER BY id",
    )?;
    let expenses = expense_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, amount, currency, date, note, method, tags_json) in expenses {
        let method_ok = method.as_deref().map_or(true, |value| {
            matches!(value, "cash" | "card" | "transfer" | "bank" | "other")
        });
        let tags_ok = match tags_json.as_deref() {
            None => true,
            Some(raw) => serde_json::from_str::<Vec<String>>(raw)
                .map(|tags| {
                    tags.len() <= 20
                        && tags
                            .iter()
                            .all(|tag| !tag.trim().is_empty() && tag.chars().count() <= 40)
                })
                .unwrap_or(false),
        };
        if id.trim().is_empty()
            || amount <= 0
            || amount > 9_000_000_000_000_000
            || !valid_currency(&currency)
            || !valid_date(&date)
            || note.is_some_and(|value| value.chars().count() > 500)
            || !method_ok
            || !tags_ok
        {
            return Err(AppError::Message(format!(
                "Backup contains an invalid expense record ({id})."
            )));
        }
    }

    let invalid_budget: Option<String> = conn
        .query_row(
            "SELECT id FROM budgets
             WHERE limit_amount_minor <= 0
                OR length(currency_code) != 3
                OR period_type NOT IN ('weekly','monthly','yearly')
             LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = invalid_budget {
        return Err(AppError::Message(format!(
            "Backup contains an invalid budget record ({id})."
        )));
    }

    let mut fx_stmt = conn.prepare("SELECT id,from_code,to_code,rate,as_of_date FROM fx_rates")?;
    let rates = fx_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, from, to, rate, date) in rates {
        if id.trim().is_empty()
            || !valid_currency(&from)
            || !valid_currency(&to)
            || from == to
            || !rate.is_finite()
            || rate <= 0.0
            || !valid_date(&date)
        {
            return Err(AppError::Message(format!(
                "Backup contains an invalid FX rate ({id})."
            )));
        }
    }

    let mut receipt_stmt =
        conn.prepare("SELECT id,stored_name,mime_type,size_bytes,sha256 FROM receipt_attachments")?;
    let receipts = receipt_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, stored, mime, size, sha) in receipts {
        if id.trim().is_empty()
            || safe_single_component(&stored).is_err()
            || !matches!(mime.as_str(), "image/jpeg" | "image/png" | "image/webp")
            || !(1..=10 * 1024 * 1024).contains(&size)
            || sha.len() != 64
            || !sha.chars().all(|character| character.is_ascii_hexdigit())
        {
            return Err(AppError::Message(format!(
                "Backup contains invalid receipt metadata ({id})."
            )));
        }
    }
    Ok(())
}

fn validate_sqlite(path: &Path, expected_schema: Option<i32>) -> AppResult<()> {
    if !path.is_file() {
        return Err(AppError::Message(
            "Backup database.sqlite is missing.".into(),
        ));
    }
    let conn = Connection::open(path).map_err(|_| {
        AppError::Message("Backup does not contain a valid SQLite database.".into())
    })?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Message(format!(
            "Backup database failed SQLite integrity checking: {integrity}"
        )));
    }
    let foreign_key_issue: Option<String> = conn
        .query_row(
            "SELECT \"table\" || ':' || rowid FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(issue) = foreign_key_issue {
        return Err(AppError::Message(format!(
            "Backup database contains a broken relationship at {issue}."
        )));
    }
    let schema: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    if let Some(expected) = expected_schema {
        if schema != expected {
            return Err(AppError::Message(
                "Backup manifest and database schema versions do not match.".into(),
            ));
        }
    }
    if schema > LATEST_SCHEMA_VERSION {
        return Err(AppError::Message(format!(
            "Backup schema {schema} is newer than supported schema {LATEST_SCHEMA_VERSION}."
        )));
    }
    Ok(())
}

fn extract_zip_safely(bytes: &[u8], root: &Path) -> AppResult<()> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|_| AppError::Message("Invalid .etbackup archive.".into()))?;
    if archive.len() > MAX_ENTRIES {
        return Err(AppError::Message(
            "Backup contains too many archive entries.".into(),
        ));
    }
    let mut total = 0_u64;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(zip_error)?;
        let name = entry.name().to_string();
        if entry.is_dir() {
            if name != "receipts/" {
                return Err(AppError::Message(format!(
                    "Unexpected backup directory: {name}"
                )));
            }
            continue;
        }
        if !names.insert(name.clone()) {
            return Err(AppError::Message(
                "Backup contains duplicate archive entries.".into(),
            ));
        }
        let relative = validate_archive_entry(&name)?;
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(AppError::Message(format!(
                "Backup entry {name} is too large."
            )));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(AppError::Message(
                "Backup may not contain symbolic links.".into(),
            ));
        }
        let output = root.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = File::create(&output)?;
        let copied = std::io::copy(&mut entry.take(MAX_ENTRY_BYTES + 1), &mut file)?;
        if copied > MAX_ENTRY_BYTES {
            let _ = fs::remove_file(&output);
            return Err(AppError::Message(format!(
                "Expanded backup entry {name} is too large."
            )));
        }
        total = total
            .checked_add(copied)
            .ok_or_else(|| AppError::Message("Backup size overflow.".into()))?;
        if total > MAX_ARCHIVE_BYTES {
            let _ = fs::remove_file(&output);
            return Err(AppError::Message(
                "Expanded backup is larger than the safety limit.".into(),
            ));
        }
        set_private_permissions(&output)?;
    }
    if !names.contains("manifest.json") || !names.contains("database.sqlite") {
        return Err(AppError::Message(
            "Backup must contain manifest.json and database.sqlite.".into(),
        ));
    }
    Ok(())
}

fn validate_archive_entry(name: &str) -> AppResult<PathBuf> {
    if name == "manifest.json" || name == "database.sqlite" {
        return Ok(PathBuf::from(name));
    }
    validate_artifact_path(name)
}

fn validate_artifact_path(name: &str) -> AppResult<PathBuf> {
    let path = Path::new(name);
    let components = path.components().collect::<Vec<_>>();
    if name == "database.sqlite" {
        return Ok(path.to_path_buf());
    }
    if components.len() == 2
        && components[0] == Component::Normal("receipts".as_ref())
        && matches!(components[1], Component::Normal(_))
    {
        return Ok(path.to_path_buf());
    }
    Err(AppError::Message(format!(
        "Unsafe or unexpected backup path: {name}"
    )))
}

fn collect_archive_files(
    root: &Path,
    current: &Path,
    output: &mut HashSet<String>,
) -> AppResult<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_archive_files(root, &path, output)?;
        } else if entry.file_type()?.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| AppError::Message("Invalid extracted backup path.".into()))?;
            output.insert(relative.to_string_lossy().replace('\\', "/"));
        } else {
            return Err(AppError::Message(
                "Backup extraction produced an unsupported file type.".into(),
            ));
        }
    }
    Ok(())
}

fn add_file_to_zip(
    writer: &mut ZipWriter<File>,
    archive_path: &str,
    source: &Path,
    options: SimpleFileOptions,
) -> AppResult<()> {
    writer
        .start_file(archive_path, options)
        .map_err(zip_error)?;
    let mut input = File::open(source)?;
    std::io::copy(&mut input, writer)?;
    Ok(())
}

fn artifact_for_file(archive_path: &str, source: &Path) -> AppResult<BackupArtifact> {
    let mut input = File::open(source)?;
    let mut hasher = Sha256::new();
    let size = std::io::copy(&mut input, &mut hasher)?;
    Ok(BackupArtifact {
        path: archive_path.to_string(),
        size_bytes: size,
        sha256: format!("{:x}", hasher.finalize()),
    })
}

fn encrypt_bytes(plain: &[u8], password: &str) -> AppResult<Vec<u8>> {
    let mut salt = [0_u8; SALT_LEN];
    let mut nonce_bytes = [0_u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|_| AppError::Message("Could not derive the backup encryption key.".into()))?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| AppError::Message("Could not initialize backup encryption.".into()))?;
    let encrypted = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plain);
    key.fill(0);
    let ciphertext =
        encrypted.map_err(|_| AppError::Message("Could not encrypt the backup.".into()))?;
    let mut output =
        Vec::with_capacity(ENCRYPTED_MAGIC.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    output.extend_from_slice(ENCRYPTED_MAGIC);
    output.extend_from_slice(&salt);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt_if_needed(bytes: &[u8], password: Option<&str>) -> AppResult<(Vec<u8>, bool)> {
    if !bytes.starts_with(ENCRYPTED_MAGIC) {
        return Ok((bytes.to_vec(), false));
    }
    let minimum = ENCRYPTED_MAGIC.len() + SALT_LEN + NONCE_LEN + 16;
    if bytes.len() < minimum {
        return Err(AppError::Message("Encrypted backup is truncated.".into()));
    }
    let password = password.filter(|value| !value.is_empty()).ok_or_else(|| {
        AppError::Message("Password required to open this encrypted backup.".into())
    })?;
    let salt_start = ENCRYPTED_MAGIC.len();
    let nonce_start = salt_start + SALT_LEN;
    let cipher_start = nonce_start + NONCE_LEN;
    let mut key = [0_u8; 32];
    Argon2::default()
        .hash_password_into(
            password.as_bytes(),
            &bytes[salt_start..nonce_start],
            &mut key,
        )
        .map_err(|_| AppError::Message("Could not derive the backup decryption key.".into()))?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| AppError::Message("Could not initialize backup decryption.".into()))?;
    let decrypted = cipher.decrypt(
        Nonce::from_slice(&bytes[nonce_start..cipher_start]),
        &bytes[cipher_start..],
    );
    key.fill(0);
    let plain = decrypted.map_err(|_| {
        AppError::Message(
            "Could not decrypt backup. The password is wrong or the file was modified.".into(),
        )
    })?;
    Ok((plain, true))
}

fn decode_legacy_encrypted_json(raw: &[u8], password: &str) -> AppResult<String> {
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|_| AppError::Message("Invalid encrypted legacy backup.".into()))?;
    let password = password.as_bytes();
    if password.is_empty() {
        return Err(AppError::Message("Backup password cannot be empty.".into()));
    }
    let xored = decoded
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ password[index % password.len()])
        .collect::<Vec<_>>();
    let encoded = String::from_utf8(xored)
        .map_err(|_| AppError::Message("Legacy backup password is incorrect.".into()))?;
    percent_decode(&encoded)
}

fn percent_decode(value: &str) -> AppResult<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(AppError::Message(
                    "Legacy encrypted backup is malformed.".into(),
                ));
            }
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| AppError::Message("Invalid percent encoding.".into()))?;
            output.push(
                u8::from_str_radix(hex, 16)
                    .map_err(|_| AppError::Message("Invalid percent encoding.".into()))?,
            );
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output)
        .map_err(|_| AppError::Message("Legacy backup is not valid UTF-8.".into()))
}

fn current_base_currency(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key='ui_settings'",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    .and_then(|value| {
        value
            .get("baseCurrency")
            .and_then(|currency| currency.as_str())
            .map(str::to_string)
    })
    .unwrap_or_else(|| "USD".to_string())
}

fn valid_currency(value: &str) -> bool {
    value.len() == 3
        && value
            .chars()
            .all(|character| character.is_ascii_uppercase())
}

fn valid_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn detect_receipt_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn validate_selected_file(file_path: &str, extensions: &[&str]) -> AppResult<PathBuf> {
    let path = PathBuf::from(file_path.trim());
    if !path.is_absolute() || !path.is_file() {
        return Err(AppError::Message("Backup file not found.".into()));
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let valid = extensions.iter().any(|extension| {
        name.ends_with(&format!(".{extension}"))
            || (*extension == "json" && name.ends_with(".enc.json"))
    });
    if !valid {
        return Err(AppError::Message(
            "Selected file is not a supported Expense Tracker backup.".into(),
        ));
    }
    Ok(path)
}

fn resolve_backup_dir(value: &str) -> AppResult<PathBuf> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::Message("Backup path cannot be empty.".into()));
    }
    if value == "~" {
        return std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|_| AppError::Message("Home directory is unavailable.".into()));
    }
    if let Some(relative) = value.strip_prefix("~/") {
        return std::env::var("HOME")
            .map(|home| PathBuf::from(home).join(relative))
            .map_err(|_| AppError::Message("Home directory is unavailable.".into()));
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(AppError::Message(
            "Backup path must be an absolute folder path.".into(),
        ));
    }
    Ok(path)
}

fn backup_file_info(path: &Path) -> AppResult<BackupFileInfo> {
    let metadata = path.metadata()?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("backup.etbackup")
        .to_string();
    let encrypted = if name.ends_with(".enc.json") {
        true
    } else if name.ends_with(".etbackup") {
        let mut magic = [0_u8; 8];
        File::open(path)
            .and_then(|mut file| file.read_exact(&mut magic))
            .map(|_| &magic == ENCRYPTED_MAGIC)
            .unwrap_or(false)
    } else {
        false
    };
    let modified_at = metadata
        .modified()
        .ok()
        .map(|time| {
            let date: chrono::DateTime<chrono::Utc> = time.into();
            date.format("%Y-%m-%d %H:%M").to_string()
        })
        .unwrap_or_else(|| "—".into());
    Ok(BackupFileInfo {
        name,
        path: path.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        modified_at,
        encrypted,
    })
}

fn prune_automatic_backups(directory: &Path, keep: usize) -> AppResult<()> {
    let mut candidates = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.contains("_automatic.etbackup"))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|entry| {
        std::cmp::Reverse(
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok(),
        )
    });
    for entry in candidates.into_iter().skip(keep) {
        fs::remove_file(entry.path())?;
    }
    Ok(())
}

fn safe_single_component(value: &str) -> AppResult<String> {
    let path = Path::new(value);
    let mut components = path.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(name)), None) => Ok(name.to_string_lossy().to_string()),
        _ => Err(AppError::Message(format!("Unsafe filename: {value}"))),
    }
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)?;
            set_private_permissions(&target)?;
        } else {
            return Err(AppError::Message(
                "Restore staging contains an unsupported file type.".into(),
            ));
        }
    }
    Ok(())
}

fn read_limited(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let metadata = path.metadata()?;
    if metadata.len() > limit {
        return Err(AppError::Message(format!(
            "{} is larger than the allowed safety limit.",
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Backup")
        )));
    }
    Ok(fs::read(path)?)
}

fn write_private(path: &Path, bytes: &[u8]) -> AppResult<()> {
    fs::write(path, bytes)?;
    set_private_permissions(path)
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> AppResult<()> {
    Ok(())
}

fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Message(format!("Backup archive error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::NewExpenseInput;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path =
                std::env::temp_dir().join(format!("expense-tracker-{label}-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn seeded_database(directory: &Path) -> (AppDb, String) {
        let db = AppDb::open_in_directory(directory.to_path_buf()).expect("open test database");
        let expense = db
            .create_expense(NewExpenseInput {
                amount_minor: 4250,
                currency_code: "USD".into(),
                category_id: "__uncategorized__".into(),
                date: "2026-07-28".into(),
                note: Some("Test receipt".into()),
                payment_method: Some("card".into()),
                tags: Some(vec!["test".into()]),
            })
            .expect("create expense");
        let source = directory.join("source.png");
        fs::write(
            &source,
            [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4],
        )
        .expect("write receipt");
        db.attach_receipt(&expense.id, &source.to_string_lossy())
            .expect("attach receipt");
        (db, expense.id)
    }

    fn replace_zip_entry(archive_path: &Path, target: &str, replacement: &[u8]) {
        let input = File::open(archive_path).expect("open archive for tampering");
        let mut archive = ZipArchive::new(input).expect("read archive for tampering");
        let mut entries = Vec::new();
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).expect("read zip entry");
            if entry.is_dir() {
                continue;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).expect("read zip bytes");
            if entry.name() == target {
                bytes = replacement.to_vec();
            }
            entries.push((entry.name().to_string(), bytes));
        }
        drop(archive);

        let output = File::create(archive_path).expect("rewrite tampered archive");
        let mut writer = ZipWriter::new(output);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o600);
        for (name, bytes) in entries {
            writer.start_file(name, options).expect("start zip entry");
            writer.write_all(&bytes).expect("write zip entry");
        }
        writer.finish().expect("finish tampered archive");
    }

    #[test]
    fn archive_round_trip_validates_database_and_receipt() {
        let source = TestDirectory::new("archive-source");
        let backups = TestDirectory::new("archive-output");
        let (db, _) = seeded_database(source.path());

        let info = create_archive(&db, &backups.path().to_string_lossy(), None, "manual")
            .expect("create archive");
        assert!(info.name.ends_with(".etbackup"));
        assert!(!info.encrypted);

        let inspection = inspect_archive(&db, &info.path, None).expect("inspect generated archive");
        assert!(inspection.integrity_ok);
        assert_eq!(inspection.manifest.format_version, FORMAT_VERSION);
        assert_eq!(inspection.manifest.record_counts["expenses"], 1);
        assert_eq!(inspection.manifest.record_counts["receipts"], 1);
        assert!(inspection
            .manifest
            .artifacts
            .iter()
            .any(|artifact| artifact.path.starts_with("receipts/")));
    }

    #[test]
    fn encrypted_archive_rejects_missing_and_wrong_passwords() {
        let source = TestDirectory::new("encrypted-source");
        let backups = TestDirectory::new("encrypted-output");
        let (db, _) = seeded_database(source.path());
        let info = create_archive(
            &db,
            &backups.path().to_string_lossy(),
            Some("correct horse battery staple"),
            "manual",
        )
        .expect("create encrypted archive");
        assert!(info.encrypted);

        let missing = inspect_archive(&db, &info.path, None)
            .expect_err("missing password must be rejected")
            .to_string();
        assert!(missing.contains("Password required"));
        let wrong = inspect_archive(&db, &info.path, Some("incorrect password"))
            .expect_err("wrong password must be rejected")
            .to_string();
        assert!(wrong.contains("wrong") || wrong.contains("modified"));
        inspect_archive(&db, &info.path, Some("correct horse battery staple"))
            .expect("correct password");
    }

    #[test]
    fn modified_receipt_is_rejected_before_restore() {
        let source = TestDirectory::new("tamper-source");
        let backups = TestDirectory::new("tamper-output");
        let (db, _) = seeded_database(source.path());
        let info = create_archive(&db, &backups.path().to_string_lossy(), None, "manual")
            .expect("create archive");
        let inspection = inspect_archive(&db, &info.path, None).expect("initial inspection");
        let receipt_path = inspection
            .manifest
            .artifacts
            .iter()
            .find(|artifact| artifact.path.starts_with("receipts/"))
            .expect("receipt artifact")
            .path
            .clone();
        replace_zip_entry(
            Path::new(&info.path),
            &receipt_path,
            &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 9, 9, 9],
        );

        let error = inspect_archive(&db, &info.path, None)
            .expect_err("tampered receipt must fail")
            .to_string();
        assert!(error.contains("checksum"));
    }

    #[test]
    fn dry_run_and_merge_add_new_expense_and_receipt() {
        let source = TestDirectory::new("merge-source");
        let target = TestDirectory::new("merge-target");
        let backups = TestDirectory::new("merge-output");
        let (source_db, expense_id) = seeded_database(source.path());
        let info = create_archive(
            &source_db,
            &backups.path().to_string_lossy(),
            None,
            "manual",
        )
        .expect("create merge archive");
        let target_db =
            AppDb::open_in_directory(target.path().to_path_buf()).expect("open merge target");

        let dry_run = restore_archive(
            &target_db,
            &info.path,
            None,
            RestoreMode::DryRun,
            &backups.path().to_string_lossy(),
        )
        .expect("dry run");
        assert_eq!(dry_run.added["expenses"], 1);
        assert_eq!(dry_run.added["receipts"], 1);

        let merged = restore_archive(
            &target_db,
            &info.path,
            None,
            RestoreMode::Merge,
            &backups.path().to_string_lossy(),
        )
        .expect("merge restore");
        assert_eq!(merged.added["expenses"], 1);
        assert_eq!(merged.added["receipts"], 1);
        assert!(target_db
            .list_expenses()
            .expect("list expenses")
            .iter()
            .any(|expense| expense.id == expense_id));
        assert!(target_db
            .get_receipt(&expense_id)
            .expect("get receipt")
            .is_some());
    }

    #[test]
    fn replace_is_staged_and_applied_on_next_database_open() {
        let source = TestDirectory::new("replace-source");
        let target = TestDirectory::new("replace-target");
        let backups = TestDirectory::new("replace-output");
        let (source_db, source_expense_id) = seeded_database(source.path());
        let info = create_archive(
            &source_db,
            &backups.path().to_string_lossy(),
            None,
            "manual",
        )
        .expect("create replacement archive");
        let target_db =
            AppDb::open_in_directory(target.path().to_path_buf()).expect("open replace target");
        target_db
            .create_expense(NewExpenseInput {
                amount_minor: 100,
                currency_code: "USD".into(),
                category_id: "__uncategorized__".into(),
                date: "2026-07-27".into(),
                note: Some("Old target data".into()),
                payment_method: Some("cash".into()),
                tags: None,
            })
            .expect("create target expense");

        let summary = restore_archive(
            &target_db,
            &info.path,
            None,
            RestoreMode::Replace,
            &backups.path().to_string_lossy(),
        )
        .expect("stage replacement");
        assert!(summary.restart_required);
        assert!(summary
            .safety_backup_path
            .as_deref()
            .is_some_and(|path| Path::new(path).is_file()));
        drop(target_db);

        let reopened =
            AppDb::open_in_directory(target.path().to_path_buf()).expect("apply pending restore");
        let expenses = reopened.list_expenses().expect("list restored expenses");
        assert_eq!(expenses.len(), 1);
        assert_eq!(expenses[0].id, source_expense_id);
        assert!(reopened
            .get_receipt(&source_expense_id)
            .expect("restored receipt")
            .is_some());
    }

    #[test]
    fn invalid_pending_replace_is_quarantined_and_old_data_reopens() {
        let source = TestDirectory::new("failed-replace-source");
        let target = TestDirectory::new("failed-replace-target");
        let backups = TestDirectory::new("failed-replace-output");
        let (source_db, _) = seeded_database(source.path());
        let info = create_archive(
            &source_db,
            &backups.path().to_string_lossy(),
            None,
            "manual",
        )
        .expect("create replacement archive");
        let target_db =
            AppDb::open_in_directory(target.path().to_path_buf()).expect("open replace target");
        let old_expense = target_db
            .create_expense(NewExpenseInput {
                amount_minor: 100,
                currency_code: "USD".into(),
                category_id: "__uncategorized__".into(),
                date: "2026-07-27".into(),
                note: Some("Keep this data".into()),
                payment_method: Some("cash".into()),
                tags: None,
            })
            .expect("create target expense");
        restore_archive(
            &target_db,
            &info.path,
            None,
            RestoreMode::Replace,
            &backups.path().to_string_lossy(),
        )
        .expect("stage replacement");

        let pending: PendingRestore = serde_json::from_slice(
            &fs::read(target.path().join("pending-restore.json")).expect("read pending restore"),
        )
        .expect("parse pending restore");
        fs::write(
            target
                .path()
                .join(pending.staging_directory)
                .join("database.sqlite"),
            b"not a database",
        )
        .expect("corrupt staged database");
        drop(target_db);

        let reopened =
            AppDb::open_in_directory(target.path().to_path_buf()).expect("reopen old database");
        let expenses = reopened.list_expenses().expect("list old expenses");
        assert_eq!(expenses.len(), 1);
        assert_eq!(expenses[0].id, old_expense.id);
        assert!(target.path().join("pending-restore.failed.json").is_file());
        assert!(target.path().join("restore-failure.txt").is_file());
    }
}
