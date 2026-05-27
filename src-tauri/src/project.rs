use crate::models::{AssetData, ImportedAsset};
use crate::util::{
    build_image_preview, download_image_bytes, file_name_from_url, mime_from_path, read_asset_data,
    resolve_project_asset_path, sanitize_file_name, to_string, unique_file_name, PROJECT_FILE,
};
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn save_project(project_dir: String, project_json: String) -> Result<(), String> {
    let dir = PathBuf::from(project_dir);
    fs::create_dir_all(dir.join("assets")).map_err(to_string)?;
    let target = dir.join(PROJECT_FILE);
    let temp = dir.join(format!("{PROJECT_FILE}.tmp"));
    fs::write(&temp, project_json).map_err(to_string)?;
    fs::rename(temp, target).map_err(to_string)
}

#[tauri::command]
pub fn open_project(project_dir: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(project_dir).join(PROJECT_FILE)).map_err(to_string)
}

#[tauri::command]
pub fn read_project_asset(project_dir: String, relative_path: String) -> Result<AssetData, String> {
    read_asset_data(&project_dir, &relative_path)
}

#[tauri::command]
pub fn read_project_asset_preview(
    project_dir: String,
    relative_path: String,
    max_dimension: u32,
) -> Result<AssetData, String> {
    let target = resolve_project_asset_path(&project_dir, &relative_path)?;
    let bytes = fs::read(&target).map_err(to_string)?;
    let source_mime = mime_from_path(&target);
    let preview_max = max_dimension.clamp(96, 2048);

    Ok(build_image_preview(&bytes, preview_max).unwrap_or_else(|_| AssetData {
        mime_type: source_mime.to_string(),
        data_base64: general_purpose::STANDARD.encode(bytes),
    }))
}

#[tauri::command]
pub fn import_asset(
    project_dir: String,
    file_name: String,
    data_base64: String,
) -> Result<ImportedAsset, String> {
    let dir = PathBuf::from(project_dir);
    let assets_dir = dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(to_string)?;

    let safe_name = unique_file_name(&assets_dir, &sanitize_file_name(&file_name));
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("图片 base64 解码失败：{error}"))?;
    let target = assets_dir.join(&safe_name);
    fs::write(&target, bytes).map_err(to_string)?;

    Ok(ImportedAsset {
        file_name: safe_name.clone(),
        relative_path: format!("assets/{safe_name}"),
        absolute_path: target.to_string_lossy().to_string(),
        mime_type: mime_from_path(&target).to_string(),
    })
}

#[tauri::command]
pub async fn import_remote_asset(project_dir: String, url: String) -> Result<ImportedAsset, String> {
    let url = url.trim();
    let (mime_type, bytes) = download_image_bytes(url).await?;
    let dir = PathBuf::from(project_dir);
    let assets_dir = dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(to_string)?;

    let guessed_name = file_name_from_url(url, &mime_type);
    let safe_name = unique_file_name(&assets_dir, &sanitize_file_name(&guessed_name));
    let target = assets_dir.join(&safe_name);
    fs::write(&target, bytes).map_err(to_string)?;

    Ok(ImportedAsset {
        file_name: safe_name.clone(),
        relative_path: format!("assets/{safe_name}"),
        absolute_path: target.to_string_lossy().to_string(),
        mime_type,
    })
}

#[tauri::command]
pub async fn download_remote_asset(url: String) -> Result<AssetData, String> {
    let (mime_type, bytes) = download_image_bytes(url.trim()).await?;
    Ok(AssetData {
        mime_type,
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn saves_and_opens_project_json() {
        let dir = temp_project_dir();
        let json = r#"{"version":1,"name":"io-test"}"#.to_string();

        save_project(dir.to_string_lossy().to_string(), json.clone()).unwrap();
        let loaded = open_project(dir.to_string_lossy().to_string()).unwrap();

        assert_eq!(loaded, json);
        assert!(dir.join("assets").is_dir());
        assert!(!dir.join(format!("{PROJECT_FILE}.tmp")).exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn imports_asset_into_assets_directory() {
        let dir = temp_project_dir();
        let data = general_purpose::STANDARD.encode([137, 80, 78, 71]);

        let imported =
            import_asset(dir.to_string_lossy().to_string(), "hello image.png".into(), data)
                .unwrap();

        assert_eq!(imported.relative_path, format!("assets/{}", imported.file_name));
        assert!(imported.file_name.ends_with(".png"));
        assert!(PathBuf::from(&imported.absolute_path).is_file());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_only_assets_inside_project_directory() {
        let dir = temp_project_dir();
        let assets_dir = dir.join("assets");
        fs::create_dir_all(&assets_dir).unwrap();
        fs::write(assets_dir.join("reference.png"), [137, 80, 78, 71]).unwrap();
        fs::write(dir.join("project.museboard.json"), "{}").unwrap();

        let data = read_project_asset(
            dir.to_string_lossy().to_string(),
            "assets/reference.png".to_string(),
        )
        .unwrap();

        assert_eq!(data.mime_type, "image/png");
        assert_eq!(data.data_base64, general_purpose::STANDARD.encode([137, 80, 78, 71]));
        assert!(read_project_asset(
            dir.to_string_lossy().to_string(),
            "assets/../project.museboard.json".to_string(),
        )
        .is_err());

        let _ = fs::remove_dir_all(dir);
    }

    fn temp_project_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "museboard_test_{}_{}_{}",
            std::process::id(),
            stamp,
            counter
        ))
    }
}
